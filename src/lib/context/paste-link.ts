/**
 * Paste-a-link escape hatch (ticket-29). A URL in the user's message is fetched
 * server-side, its HTML reduced to readable text, size-capped, and injected into
 * the chat context labelled with its source — so the model can answer from a page
 * the user already has, without the web-search tool.
 *
 * The security posture is deliberately narrow (this runs inside the chat Route
 * Handler with the app's own network egress, so it is an SSRF surface):
 *   - http(s) only — no file://, data:, ftp:, etc.
 *   - IP-literal hosts are parsed to bytes and range-checked BEFORE the fetch —
 *     including IPv4-mapped and NAT64 IPv6 forms that embed an IPv4 address
 *     (`[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`, `[64:ff9b::7f00:1]`). An
 *     IPv6-looking literal that fails to parse is refused (fail closed).
 *   - redirects are NOT followed (`redirect: 'manual'`) — a redirect to a private
 *     range can't be used to bypass the pre-flight host check.
 *   - a hard timeout via AbortController.
 *   - the body is size-capped DURING download: a declared Content-Length above
 *     ~1MB is rejected without reading, and the stream is read with a byte budget
 *     and cancelled at the cap — never buffered unbounded into route memory.
 *     HTML is stripped to text so no scripts/markup reach the prompt.
 *
 * Known residual (accepted for the single-user threat model): the guard checks
 * the hostname only — a PUBLIC hostname whose DNS resolves to a private IP (DNS
 * rebinding) bypasses it. Closing that requires resolving DNS and pinning the
 * connection to the checked address, which this deliberately does not do.
 *
 * The extraction + sanitization are pure (fetch is injected) so they can be unit
 * tested without network access; `fetchLinkContext` wires the real `fetch`.
 */

/** Max characters of extracted text injected per link (~50KB). */
export const MAX_LINK_TEXT = 50_000

/** Byte budget for a single link download — the stream is cancelled at this cap. */
export const MAX_DOWNLOAD_BYTES = 50_000

/** A declared Content-Length above this is rejected without reading the body. */
export const MAX_CONTENT_LENGTH = 1_000_000

/** Fetch timeout for a pasted link. */
export const LINK_FETCH_TIMEOUT_MS = 8_000

/** Max links fetched from a single user message (bounds cost + latency). */
export const MAX_LINKS_PER_MESSAGE = 3

/** A URL found in the user's message, normalised. */
export interface ExtractedLink {
  /** The exact URL as it appeared (used for display/sourcing). */
  raw: string
  /** The parsed URL (http/https only). */
  url: URL
}

/** The outcome of fetching one link — either usable text or a reason it was skipped. */
export interface FetchedLink {
  url: string
  /** Sanitised, size-capped text; present only when the fetch succeeded. */
  text?: string
  /** Populated when the link could not be used (bad scheme, private host, error). */
  error?: string
}

/**
 * Pull http(s) URLs out of free text, in order, de-duplicated, capped. We only
 * recognise explicit `http://` / `https://` URLs — a bare `example.com` is left
 * alone (too ambiguous, and not something the user "pasted as a link").
 */
export function extractUrls(text: string, max = MAX_LINKS_PER_MESSAGE): ExtractedLink[] {
  if (!text) return []
  const matches = text.match(/https?:\/\/[^\s<>()[\]{}"'`|\\]+/gi) ?? []
  const out: ExtractedLink[] = []
  const seen = new Set<string>()
  for (const m of matches) {
    // Trim trailing punctuation that commonly rides along in prose ("see https://x.com.").
    const trimmed = m.replace(/[.,;:!?)\]}'"]+$/, '')
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    const key = url.href
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ raw: trimmed, url })
    if (out.length >= max) break
  }
  return out
}

// ── IP-literal parsing (SSRF guard, parse-to-bytes) ──────────────────────────

/** Parse a strict dotted-quad IPv4 literal into 4 bytes, else null. */
export function parseIPv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const bytes = m.slice(1, 5).map(Number)
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null
}

/**
 * Parse an IPv6 literal (brackets already stripped) into 16 bytes, else null.
 * Handles `::` compression and an embedded dotted-quad IPv4 tail
 * (`::ffff:127.0.0.1`). A zone index (`%eth0`) is rejected.
 */
export function parseIPv6(host: string): number[] | null {
  if (host.includes('%')) return null
  const doubles = host.split('::')
  if (doubles.length > 2) return null

  const parseGroups = (s: string): number[] | null => {
    if (s === '') return []
    const groups = s.split(':')
    const bytes: number[] = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      // An embedded IPv4 tail is only legal as the LAST group.
      if (g.includes('.')) {
        if (i !== groups.length - 1) return null
        const v4 = parseIPv4(g)
        if (!v4) return null
        bytes.push(...v4)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
      const v = parseInt(g, 16)
      bytes.push((v >> 8) & 0xff, v & 0xff)
    }
    return bytes
  }

  const head = parseGroups(doubles[0])
  if (head === null) return null

  if (doubles.length === 1) {
    return head.length === 16 ? head : null
  }
  const tail = parseGroups(doubles[1])
  if (tail === null) return null
  const fill = 16 - head.length - tail.length
  // `::` must compress at least one zero group; a full 16 bytes plus `::` is invalid.
  if (fill <= 0) return null
  return [...head, ...(new Array(fill).fill(0) as number[]), ...tail]
}

/** Range checks on 4 IPv4 bytes. Returns a reason when blocked, else null. */
function ipv4Reason(b: number[]): string | null {
  const [a, b2] = b
  if (a === 127) return 'loopback range'
  if (a === 0) return 'reserved range'
  if (a === 10) return 'private range'
  if (a === 172 && b2 >= 16 && b2 <= 31) return 'private range'
  if (a === 192 && b2 === 168) return 'private range'
  if (a === 169 && b2 === 254) return 'link-local range'
  if (a === 100 && b2 >= 64 && b2 <= 127) return 'carrier-grade NAT range'
  return null
}

/** Range checks on 16 IPv6 bytes. Returns a reason when blocked, else null. */
function ipv6Reason(b: number[]): string | null {
  const zeroThrough = (n: number) => b.slice(0, n).every((x) => x === 0)

  // :: (unspecified) and ::1 (loopback).
  if (zeroThrough(15)) {
    if (b[15] === 0) return 'unspecified address'
    if (b[15] === 1) return 'loopback address'
  }
  // fe80::/10 link-local.
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return 'link-local range'
  // fc00::/7 unique-local.
  if ((b[0] & 0xfe) === 0xfc) return 'unique-local range'
  // ::ffff:0:0/96 IPv4-mapped — recurse into the embedded IPv4.
  if (zeroThrough(10) && b[10] === 0xff && b[11] === 0xff) {
    const inner = ipv4Reason(b.slice(12))
    return inner ? `IPv4-mapped ${inner}` : null
  }
  // 64:ff9b::/96 NAT64 — recurse into the embedded IPv4.
  if (
    b[0] === 0x00 &&
    b[1] === 0x64 &&
    b[2] === 0xff &&
    b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)
  ) {
    const inner = ipv4Reason(b.slice(12))
    return inner ? `NAT64-embedded ${inner}` : null
  }
  return null
}

/**
 * Refuse hosts that point back into private/internal address space — the classic
 * SSRF targets. IP literals are parsed to bytes and range-checked (no string
 * prefix matching), covering IPv4-mapped (`::ffff:127.0.0.1` / `::ffff:7f00:1`)
 * and NAT64 (`64:ff9b::/96`) forms that embed an IPv4 address. An IPv6-looking
 * literal that fails to parse is refused (fail closed). We do not resolve DNS —
 * see the module docblock for the accepted DNS-rebinding residual.
 */
export function privateHostReason(hostname: string): string | null {
  // Normalise: lowercase, strip a trailing dot, strip URL brackets around IPv6.
  const h = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '')

  if (h === 'localhost' || h.endsWith('.localhost')) return 'loopback host'
  if (h === 'metadata.google.internal') return 'metadata host'

  const v4 = parseIPv4(h)
  if (v4) {
    if (h === '169.254.169.254') return 'metadata host'
    return ipv4Reason(v4)
  }

  if (h.includes(':')) {
    const v6 = parseIPv6(h)
    if (!v6) return 'unparseable IPv6 literal'
    return ipv6Reason(v6)
  }

  return null
}

/**
 * Reduce an HTML (or plain-text) response body to readable text: drop script/style
 * blocks, strip tags, decode a few common entities, collapse whitespace. Truncates
 * to `MAX_LINK_TEXT`. Not a full HTML parser — deliberately conservative so nothing
 * script-like survives into the prompt.
 */
export function htmlToText(body: string, contentType = ''): string {
  let text = body
  if (!contentType || /html/i.test(contentType) || /<[a-z!/]/i.test(body)) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
  }
  text = text
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
  if (text.length > MAX_LINK_TEXT) text = text.slice(0, MAX_LINK_TEXT) + '\n…[truncated]'
  return text
}

/** The minimal streamed-body surface we read (web ReadableStream reader shape). */
export interface BodyReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
  cancel?(reason?: unknown): Promise<void> | void
}

/** Injectable fetch signature (real `fetch`, or a mock in tests). */
export type FetchLike = (
  input: string,
  init?: {
    method?: string
    redirect?: 'manual' | 'follow' | 'error'
    signal?: AbortSignal
    headers?: Record<string, string>
  }
) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  body?: { getReader(): BodyReaderLike } | null
  text(): Promise<string>
}>

/**
 * Read a response body with a hard byte budget. Prefers the stream reader so the
 * download is CANCELLED at the cap (never buffered whole); falls back to `text()`
 * + slice only when no stream surface is exposed (some mocks/environments).
 */
export async function readBodyCapped(
  res: Awaited<ReturnType<FetchLike>>,
  maxBytes = MAX_DOWNLOAD_BYTES
): Promise<string> {
  const reader = res.body?.getReader?.()
  if (!reader) {
    // No stream surface — fall back, still bounding what we keep.
    const whole = await res.text()
    return whole.length > maxBytes ? whole.slice(0, maxBytes) : whole
  }
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let received = 0
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    const remaining = maxBytes - received
    if (value.byteLength >= remaining) {
      out += decoder.decode(value.subarray(0, remaining), { stream: false })
      received += remaining
      await reader.cancel?.('byte budget exceeded')
      break
    }
    out += decoder.decode(value, { stream: true })
    received += value.byteLength
  }
  return out
}

/**
 * Fetch and sanitise one link. Pure of ambient globals except the injected fetch
 * and AbortController, so tests can drive every branch with a mock.
 */
export async function fetchOneLink(
  link: ExtractedLink,
  fetchImpl: FetchLike,
  timeoutMs = LINK_FETCH_TIMEOUT_MS
): Promise<FetchedLink> {
  const host = link.url.hostname
  const blocked = privateHostReason(host)
  if (blocked) return { url: link.raw, error: `refused (${blocked})` }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(link.url.href, {
      method: 'GET',
      redirect: 'manual', // never chase a redirect into a private range
      signal: controller.signal,
      headers: { accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
    })
    if (res.status >= 300 && res.status < 400) {
      return { url: link.raw, error: `redirect not followed (${res.status})` }
    }
    if (!res.ok) return { url: link.raw, error: `fetch failed (${res.status})` }
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !/text\/html|text\/plain|application\/(xhtml|json)/i.test(contentType)) {
      return { url: link.raw, error: `unsupported content type (${contentType})` }
    }
    // Reject a declared oversize body before reading a single byte of it.
    const declared = Number(res.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_CONTENT_LENGTH) {
      return { url: link.raw, error: `too large (content-length ${declared})` }
    }
    // Stream with a byte budget — the download itself is capped, not just the
    // retained text.
    const raw = await readBodyCapped(res)
    const text = htmlToText(raw, contentType)
    if (!text) return { url: link.raw, error: 'no readable text' }
    return { url: link.raw, text }
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'fetch error'
    return { url: link.raw, error: reason }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Extract every http(s) link from `text`, fetch each, and format the usable ones
 * into a single context block for the system prompt. Returns null when there is
 * nothing to inject (no links, or none fetched cleanly).
 */
export async function fetchLinkContext(
  text: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<string | null> {
  const links = extractUrls(text)
  if (links.length === 0) return null
  const results = await Promise.all(links.map((l) => fetchOneLink(l, fetchImpl)))
  return formatLinkContext(results)
}

/**
 * Render fetched-link results as a prompt context block. Successful links carry
 * their source URL so the model can cite it; failed links are noted briefly so the
 * model can tell the user it couldn't read a pasted link rather than hallucinate.
 * The injection is single-turn (system-prompt only, driven by the LATEST user
 * message) — the block says so, so the model doesn't claim page contents it no
 * longer has on a later turn.
 */
export function formatLinkContext(results: FetchedLink[]): string | null {
  const usable = results.filter((r) => r.text)
  const failed = results.filter((r) => !r.text)
  if (usable.length === 0 && failed.length === 0) return null

  const parts: string[] = [
    'The user pasted one or more links in their LATEST message. Their fetched contents are below, available for THIS turn only. Treat this as source material and cite the source URL when you use it. On later turns you will no longer have these page contents — if they are needed again, ask the user to re-paste the link rather than answering as if you still had them.',
  ]
  for (const r of usable) {
    parts.push(`--- Pasted link: ${r.url} ---\n${r.text}`)
  }
  if (failed.length > 0) {
    const lines = failed.map((r) => `- ${r.url}: ${r.error}`).join('\n')
    parts.push(`Links that could not be read (tell the user rather than guessing):\n${lines}`)
  }
  return parts.join('\n\n')
}
