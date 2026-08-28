/**
 * Paste-a-link escape hatch (ticket-29). A URL in the user's message is fetched
 * server-side, its HTML reduced to readable text, size-capped, and injected into
 * the chat context labelled with its source — so the model can answer from a page
 * the user already has, without the web-search tool.
 *
 * The security posture is deliberately narrow (this runs inside the chat Route
 * Handler with the app's own network egress, so it is an SSRF surface):
 *   - http(s) only — no file://, data:, ftp:, etc.
 *   - private / loopback / link-local / metadata hosts are refused BEFORE the fetch.
 *   - redirects are NOT followed (`redirect: 'manual'`) — a redirect to a private
 *     range can't be used to bypass the pre-flight host check.
 *   - a hard timeout via AbortController.
 *   - the response body is read then truncated to a byte cap; HTML is stripped to
 *     text so we never inject scripts/markup into the prompt.
 *
 * The extraction + sanitization are pure (fetch is injected) so they can be unit
 * tested without network access; `fetchLinkContext` wires the real `fetch`.
 */

/** Max characters of extracted text injected per link (~50KB). */
export const MAX_LINK_TEXT = 50_000

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

/**
 * Refuse hosts that point back into private/internal address space — the classic
 * SSRF targets. String-level checks against the hostname (we do not resolve DNS
 * here; combined with `redirect: 'manual'` this blocks the obvious cases without a
 * resolver round-trip). Returns a reason string when blocked, else null.
 */
export function privateHostReason(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return 'loopback host'
  if (h === '0.0.0.0' || h === '::' || h === '::1' || h === '[::1]') return 'loopback host'
  // Cloud metadata endpoints (AWS/GCP/Azure link-local).
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return 'metadata host'

  // IPv4 literal ranges.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127) return 'loopback range'
    if (a === 10) return 'private range'
    if (a === 0) return 'reserved range'
    if (a === 169 && b === 254) return 'link-local range'
    if (a === 172 && b >= 16 && b <= 31) return 'private range'
    if (a === 192 && b === 168) return 'private range'
    if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT range'
  }
  // Bracketed / bare IPv6 loopback + unique-local / link-local prefixes.
  const v6 = h.replace(/^\[|\]$/g, '')
  if (v6.startsWith('fc') || v6.startsWith('fd')) return 'unique-local range'
  if (v6.startsWith('fe80')) return 'link-local range'

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
  text(): Promise<string>
}>

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
    const raw = await res.text()
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
 */
export function formatLinkContext(results: FetchedLink[]): string | null {
  const usable = results.filter((r) => r.text)
  const failed = results.filter((r) => !r.text)
  if (usable.length === 0 && failed.length === 0) return null

  const parts: string[] = [
    'The user pasted one or more links. Their fetched contents are below. Treat this as source material and cite the source URL when you use it.',
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
