/**
 * Tests for the paste-a-link escape hatch (ticket-29).
 *
 * The URL extraction, HTML→text sanitization, and private-host guard are pure
 * (fetch is injected), so every branch is exercised here without network access.
 * We do NOT hit any real URL — `fetch` is always a mock. The Anthropic web-search
 * tool is provider-executed and is never exercised in jest (no live API in tests).
 *
 * Spec: ticket-29 §3 (paste-a-link) — fetch server-side, sanitize (html→text, cap
 * ~50KB, timeout, http(s) only, no redirects into private ranges).
 */

import {
  extractUrls,
  privateHostReason,
  htmlToText,
  fetchOneLink,
  fetchLinkContext,
  formatLinkContext,
  MAX_LINK_TEXT,
  MAX_LINKS_PER_MESSAGE,
  type FetchLike,
} from '@/lib/context/paste-link'

/** Build a mock fetch that returns one canned response (or throws). */
function mockFetch(
  response: Partial<{
    ok: boolean
    status: number
    contentType: string
    body: string
    throws: Error
  }>
): FetchLike & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (input: string) => {
    calls.push(input)
    if (response.throws) throw response.throws
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: {
        get: (n: string) =>
          n.toLowerCase() === 'content-type' ? (response.contentType ?? 'text/html') : null,
      },
      text: async () => response.body ?? '',
    }
  }) as FetchLike & { calls: string[] }
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

describe('privateHostReason (SSRF guard)', () => {
  it('blocks loopback + localhost', () => {
    expect(privateHostReason('localhost')).toBeTruthy()
    expect(privateHostReason('127.0.0.1')).toBeTruthy()
    expect(privateHostReason('::1')).toBeTruthy()
  })

  it('blocks private IPv4 ranges', () => {
    expect(privateHostReason('10.0.0.5')).toBeTruthy()
    expect(privateHostReason('172.16.3.4')).toBeTruthy()
    expect(privateHostReason('192.168.1.1')).toBeTruthy()
  })

  it('blocks the cloud metadata endpoints', () => {
    expect(privateHostReason('169.254.169.254')).toBeTruthy()
    expect(privateHostReason('metadata.google.internal')).toBeTruthy()
  })

  it('blocks IPv6 unique-local + link-local', () => {
    expect(privateHostReason('fd00::1')).toBeTruthy()
    expect(privateHostReason('fe80::1')).toBeTruthy()
  })

  it('allows ordinary public hosts', () => {
    expect(privateHostReason('example.com')).toBeNull()
    expect(privateHostReason('8.8.8.8')).toBeNull()
    expect(privateHostReason('172.15.0.1')).toBeNull() // just below the private block
    expect(privateHostReason('172.32.0.1')).toBeNull() // just above
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
  it('renders usable links as cited source material', () => {
    const block = formatLinkContext([{ url: 'https://a.com', text: 'Body A' }])
    expect(block).toContain('Pasted link: https://a.com')
    expect(block).toContain('Body A')
    expect(block).toMatch(/cite the source URL/i)
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
