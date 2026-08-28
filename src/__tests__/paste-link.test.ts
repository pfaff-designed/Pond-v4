/**
 * @jest-environment node
 *
 * Tests for the paste-a-link escape hatch (ticket-29).
 *
 * The URL extraction, IP-literal parsing, HTML→text sanitization, private-host
 * guard, and byte-capped body reader are pure (fetch is injected), so every branch
 * is exercised here without network access. We do NOT hit any real URL — `fetch`
 * is always a mock. The Anthropic web-search tool is provider-executed and is
 * never exercised in jest (no live API in tests).
 *
 * Spec: ticket-29 §3 (paste-a-link) + security review round: parse-to-bytes SSRF
 * guard (bracketed-IPv6 / IPv4-mapped / NAT64 bypasses all pinned) and download
 * capped DURING read (Content-Length pre-check + streamed byte budget).
 */

import {
  extractUrls,
  parseIPv4,
  parseIPv6,
  privateHostReason,
  htmlToText,
  readBodyCapped,
  fetchOneLink,
  fetchLinkContext,
  formatLinkContext,
  MAX_LINK_TEXT,
  MAX_DOWNLOAD_BYTES,
  MAX_CONTENT_LENGTH,
  MAX_LINKS_PER_MESSAGE,
  type FetchLike,
  type BodyReaderLike,
} from '@/lib/context/paste-link'

/** Build a stream-reader over the given chunks, recording whether it was cancelled. */
function chunkReader(chunks: Uint8Array[]): BodyReaderLike & { cancelled: boolean } {
  let i = 0
  const reader = {
    cancelled: false,
    async read() {
      if (reader.cancelled || i >= chunks.length) return { done: true as const }
      return { done: false as const, value: chunks[i++] }
    },
    async cancel() {
      reader.cancelled = true
    },
  }
  return reader
}

/** Build a mock fetch that returns one canned response (or throws). */
function mockFetch(
  response: Partial<{
    ok: boolean
    status: number
    contentType: string
    contentLength: number
    body: string
    /** Streamed chunks; when set, the response exposes a body reader. */
    chunks: Uint8Array[]
    throws: Error
  }>
): FetchLike & { calls: string[]; reader?: BodyReaderLike & { cancelled: boolean } } {
  const calls: string[] = []
  const fn = (async (input: string) => {
    calls.push(input)
    if (response.throws) throw response.throws
    const reader = response.chunks ? chunkReader(response.chunks) : undefined
    if (reader) fn.reader = reader
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: {
        get: (n: string) => {
          const name = n.toLowerCase()
          if (name === 'content-type') return response.contentType ?? 'text/html'
          if (name === 'content-length')
            return response.contentLength !== undefined ? String(response.contentLength) : null
          return null
        },
      },
      body: reader ? { getReader: () => reader } : null,
      text: async () => response.body ?? '',
    }
  }) as FetchLike & { calls: string[]; reader?: BodyReaderLike & { cancelled: boolean } }
  fn.calls = calls
  return fn
}

describe('extractUrls', () => {
  it('pulls http(s) URLs out of prose, in order', () => {
    const links = extractUrls('see https://a.com/x and http://b.org/y please')
    expect(links.map((l) => l.raw)).toEqual(['https://a.com/x', 'http://b.org/y'])
  })

  it('trims trailing punctuation that rides along in prose', () => {
    const links = extractUrls('check https://example.com/page.')
    expect(links[0].raw).toBe('https://example.com/page')
  })

  it('ignores bare domains and non-http schemes', () => {
    expect(extractUrls('go to example.com or ftp://x.com or file:///etc/passwd')).toEqual([])
  })

  it('de-duplicates identical URLs', () => {
    const links = extractUrls('https://a.com/1 https://a.com/1')
    expect(links).toHaveLength(1)
  })

  it('caps the number of links', () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://a.com/${i}`).join(' ')
    expect(extractUrls(many)).toHaveLength(MAX_LINKS_PER_MESSAGE)
  })

  it('returns nothing for empty text', () => {
    expect(extractUrls('')).toEqual([])
  })
})

describe('parseIPv4 / parseIPv6 (parse-to-bytes)', () => {
  it('parses dotted quads strictly', () => {
    expect(parseIPv4('127.0.0.1')).toEqual([127, 0, 0, 1])
    expect(parseIPv4('256.0.0.1')).toBeNull()
    expect(parseIPv4('1.2.3')).toBeNull()
    expect(parseIPv4('example.com')).toBeNull()
  })

  it('expands :: compression to 16 bytes', () => {
    expect(parseIPv6('::1')).toEqual([...(new Array(15).fill(0) as number[]), 1])
    expect(parseIPv6('::')).toEqual(new Array(16).fill(0))
    expect(parseIPv6('fe80::1')![0]).toBe(0xfe)
  })

  it('parses an embedded IPv4 tail', () => {
    const b = parseIPv6('::ffff:127.0.0.1')!
    expect(b.slice(10)).toEqual([0xff, 0xff, 127, 0, 0, 1])
  })

  it('rejects malformed literals (fail closed upstream)', () => {
    expect(parseIPv6('::1::2')).toBeNull() // two ::
    expect(parseIPv6('fe80::1%eth0')).toBeNull() // zone index
    expect(parseIPv6('12345::')).toBeNull() // group too long
    expect(parseIPv6('1:2:3:4:5:6:7:8:9')).toBeNull() // too many groups
  })
})

describe('privateHostReason (SSRF guard)', () => {
  it('blocks loopback + localhost', () => {
    expect(privateHostReason('localhost')).toBeTruthy()
    expect(privateHostReason('sub.localhost')).toBeTruthy()
    expect(privateHostReason('127.0.0.1')).toBeTruthy()
    expect(privateHostReason('127.255.255.254')).toBeTruthy()
    expect(privateHostReason('::1')).toBeTruthy()
    expect(privateHostReason('[::1]')).toBeTruthy()
  })

  it('blocks the unspecified addresses (0.0.0.0, ::, [::])', () => {
    expect(privateHostReason('0.0.0.0')).toBeTruthy()
    expect(privateHostReason('::')).toBeTruthy()
    // Review bypass: a URL hostname keeps the brackets — '[::]' must be blocked.
    expect(privateHostReason('[::]')).toBeTruthy()
  })

  it('blocks IPv4-mapped IPv6 loopback — dotted and hex forms (review bypasses)', () => {
    // http://[::ffff:127.0.0.1]/ — dotted-quad embedded IPv4.
    expect(privateHostReason('[::ffff:127.0.0.1]')).toMatch(/IPv4-mapped/)
    expect(privateHostReason('::ffff:127.0.0.1')).toMatch(/IPv4-mapped/)
    // http://[::ffff:7f00:1]/ — the same loopback in hex-group form.
    expect(privateHostReason('[::ffff:7f00:1]')).toMatch(/IPv4-mapped/)
    expect(privateHostReason('::ffff:7f00:1')).toMatch(/IPv4-mapped/)
  })

  it('blocks IPv4-mapped private/link-local embeds, allows mapped public', () => {
    expect(privateHostReason('::ffff:10.0.0.1')).toMatch(/IPv4-mapped/)
    expect(privateHostReason('::ffff:192.168.1.1')).toMatch(/IPv4-mapped/)
    expect(privateHostReason('::ffff:169.254.169.254')).toMatch(/IPv4-mapped/)
    expect(privateHostReason('::ffff:8.8.8.8')).toBeNull()
  })

  it('blocks NAT64 (64:ff9b::/96) embeds of private IPv4, allows public', () => {
    // 7f00:1 == 127.0.0.1
    expect(privateHostReason('[64:ff9b::7f00:1]')).toMatch(/NAT64/)
    expect(privateHostReason('64:ff9b::7f00:1')).toMatch(/NAT64/)
    expect(privateHostReason('64:ff9b::a00:1')).toMatch(/NAT64/) // 10.0.0.1
    expect(privateHostReason('64:ff9b::808:808')).toBeNull() // 8.8.8.8
  })

  it('blocks private IPv4 ranges', () => {
    expect(privateHostReason('10.0.0.5')).toBeTruthy()
    expect(privateHostReason('172.16.3.4')).toBeTruthy()
    expect(privateHostReason('172.31.255.255')).toBeTruthy()
    expect(privateHostReason('192.168.1.1')).toBeTruthy()
  })

  it('blocks the cloud metadata endpoints', () => {
    expect(privateHostReason('169.254.169.254')).toBeTruthy()
    expect(privateHostReason('metadata.google.internal')).toBeTruthy()
  })

  it('blocks IPv6 unique-local + link-local', () => {
    expect(privateHostReason('fd00::1')).toBeTruthy()
    expect(privateHostReason('fc00::1')).toBeTruthy()
    expect(privateHostReason('fe80::1')).toBeTruthy()
    expect(privateHostReason('febf::1')).toBeTruthy() // still fe80::/10
  })

  it('fails closed on an unparseable IPv6 literal', () => {
    expect(privateHostReason('[::1::2]')).toBe('unparseable IPv6 literal')
    expect(privateHostReason('fe80::1%25eth0')).toBe('unparseable IPv6 literal')
  })

  it('allows ordinary public hosts', () => {
    expect(privateHostReason('example.com')).toBeNull()
    expect(privateHostReason('8.8.8.8')).toBeNull()
    expect(privateHostReason('172.15.0.1')).toBeNull() // just below the private block
    expect(privateHostReason('172.32.0.1')).toBeNull() // just above
    expect(privateHostReason('2606:4700::6810:84e5')).toBeNull() // public IPv6
  })
})

describe('htmlToText', () => {
  it('strips tags and script/style blocks', () => {
    const html =
      '<html><head><style>.x{color:red}</style></head><body><script>alert(1)</script><h1>Hi</h1><p>World</p></body></html>'
    const text = htmlToText(html, 'text/html')
    expect(text).toContain('Hi')
    expect(text).toContain('World')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('color:red')
    expect(text).not.toMatch(/[<>]/)
  })

  it('decodes common entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3</p>', 'text/html')).toContain('Tom & Jerry <3')
  })

  it('caps to MAX_LINK_TEXT', () => {
    const big = '<p>' + 'a'.repeat(MAX_LINK_TEXT + 5000) + '</p>'
    const text = htmlToText(big, 'text/html')
    expect(text.length).toBeLessThanOrEqual(MAX_LINK_TEXT + 20)
    expect(text).toContain('[truncated]')
  })

  it('leaves plain text mostly intact', () => {
    expect(htmlToText('just a plain sentence.', 'text/plain')).toBe('just a plain sentence.')
  })
})

describe('readBodyCapped (streamed byte budget)', () => {
  const enc = new TextEncoder()

  it('reads a small streamed body fully', async () => {
    const f = mockFetch({ chunks: [enc.encode('hello '), enc.encode('world')] })
    const res = await f('https://example.com/')
    expect(await readBodyCapped(res)).toBe('hello world')
  })

  it('cancels the stream at the byte cap instead of buffering the whole body', async () => {
    // 10 chunks of 10KB = 100KB total, double the byte budget.
    const chunk = enc.encode('x'.repeat(10_000))
    const f = mockFetch({ chunks: new Array(10).fill(chunk) as Uint8Array[] })
    const res = await f('https://example.com/')
    const out = await readBodyCapped(res)
    expect(out.length).toBe(MAX_DOWNLOAD_BYTES)
    expect(f.reader?.cancelled).toBe(true) // download aborted, not drained
  })

  it('truncates mid-chunk when a single chunk crosses the cap', async () => {
    const f = mockFetch({ chunks: [enc.encode('y'.repeat(MAX_DOWNLOAD_BYTES + 500))] })
    const res = await f('https://example.com/')
    const out = await readBodyCapped(res)
    expect(out.length).toBe(MAX_DOWNLOAD_BYTES)
  })

  it('falls back to text() when no stream surface exists, still bounded', async () => {
    const f = mockFetch({ body: 'z'.repeat(MAX_DOWNLOAD_BYTES + 500) })
    const res = await f('https://example.com/')
    const out = await readBodyCapped(res)
    expect(out.length).toBe(MAX_DOWNLOAD_BYTES)
  })
})

describe('fetchOneLink', () => {
  const link = { raw: 'https://example.com/a', url: new URL('https://example.com/a') }

  it('returns sanitized text on a clean fetch', async () => {
    const f = mockFetch({ body: '<h1>Prices</h1><p>$500</p>', contentType: 'text/html' })
    const r = await fetchOneLink(link, f)
    expect(r.error).toBeUndefined()
    expect(r.text).toContain('Prices')
    expect(r.text).toContain('$500')
    expect(f.calls).toEqual(['https://example.com/a'])
  })

  it('refuses a private host BEFORE fetching', async () => {
    const f = mockFetch({ body: 'secret' })
    const priv = { raw: 'http://169.254.169.254/', url: new URL('http://169.254.169.254/') }
    const r = await fetchOneLink(priv, f)
    expect(r.text).toBeUndefined()
    expect(r.error).toMatch(/refused/)
    expect(f.calls).toEqual([]) // never fetched
  })

  it('refuses the IPv4-mapped loopback bypass BEFORE fetching', async () => {
    const f = mockFetch({ body: 'secret' })
    const priv = {
      raw: 'http://[::ffff:127.0.0.1]/',
      url: new URL('http://[::ffff:127.0.0.1]/'),
    }
    const r = await fetchOneLink(priv, f)
    expect(r.error).toMatch(/refused/)
    expect(f.calls).toEqual([])
  })

  it('rejects a declared oversize Content-Length without reading the body', async () => {
    const f = mockFetch({
      contentLength: MAX_CONTENT_LENGTH + 1,
      chunks: [new TextEncoder().encode('never read')],
    })
    const r = await fetchOneLink(link, f)
    expect(r.text).toBeUndefined()
    expect(r.error).toMatch(/too large/)
  })

  it('caps an oversized streamed body during download', async () => {
    const chunk = new TextEncoder().encode('a'.repeat(10_000))
    const f = mockFetch({
      chunks: new Array(20).fill(chunk) as Uint8Array[],
      contentType: 'text/plain',
    })
    const r = await fetchOneLink(link, f)
    expect(r.error).toBeUndefined()
    // Retained text can never exceed the download byte budget (+truncation marker).
    expect(r.text!.length).toBeLessThanOrEqual(MAX_DOWNLOAD_BYTES + 20)
    expect(f.reader?.cancelled).toBe(true)
  })

  it('does not follow redirects', async () => {
    const f = mockFetch({ status: 302, contentType: 'text/html', body: '' })
    const r = await fetchOneLink(link, f)
    expect(r.error).toMatch(/redirect not followed/)
  })

  it('reports a non-ok status', async () => {
    const f = mockFetch({ ok: false, status: 404 })
    const r = await fetchOneLink(link, f)
    expect(r.error).toMatch(/fetch failed \(404\)/)
  })

  it('rejects unsupported content types', async () => {
    const f = mockFetch({ contentType: 'image/png', body: 'binary' })
    const r = await fetchOneLink(link, f)
    expect(r.error).toMatch(/unsupported content type/)
  })

  it('reports a fetch/network error', async () => {
    const f = mockFetch({ throws: new Error('boom') })
    const r = await fetchOneLink(link, f)
    expect(r.error).toMatch(/fetch error/)
  })

  it('reports a timeout as such', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    const f = mockFetch({ throws: abortErr })
    const r = await fetchOneLink(link, f)
    expect(r.error).toBe('timeout')
  })
})

describe('formatLinkContext', () => {
  it('renders usable links as cited, single-turn source material', () => {
    const block = formatLinkContext([{ url: 'https://a.com', text: 'Body A' }])
    expect(block).toContain('Pasted link: https://a.com')
    expect(block).toContain('Body A')
    expect(block).toMatch(/cite the source URL/i)
    // Single-turn honesty: the model is told the contents are for THIS turn only.
    expect(block).toMatch(/THIS turn only/i)
    expect(block).toMatch(/re-paste/i)
  })

  it('notes links that could not be read', () => {
    const block = formatLinkContext([{ url: 'https://a.com', error: 'timeout' }])
    expect(block).toMatch(/could not be read/i)
    expect(block).toContain('https://a.com: timeout')
  })

  it('returns null when there is nothing', () => {
    expect(formatLinkContext([])).toBeNull()
  })
})

describe('fetchLinkContext (end to end, mocked fetch)', () => {
  it('returns null when the message has no links', async () => {
    const f = mockFetch({ body: 'x' })
    expect(await fetchLinkContext('no links here', f)).toBeNull()
    expect(f.calls).toEqual([])
  })

  it('fetches links and injects their text', async () => {
    const f = mockFetch({ body: '<p>The clay wheel is $450</p>', contentType: 'text/html' })
    const block = await fetchLinkContext('look at https://shop.example.com/wheel', f)
    expect(block).toContain('$450')
    expect(block).toContain('https://shop.example.com/wheel')
  })
})
