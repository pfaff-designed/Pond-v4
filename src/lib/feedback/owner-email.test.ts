import { buildOwnerEmailFields, sendOwnerEmail } from './owner-email'

const BASE = {
  reporterEmail: 'reporter@example.com',
  pageTitle: 'electrician notes',
  url: 'https://pond.example/workspace?nodeId=page-1',
  now: new Date('2026-10-16T12:00:00.000Z'),
  jiraUrl: 'https://pfaff-team.atlassian.net/browse/KAN-336',
}

describe('buildOwnerEmailFields', () => {
  it('builds the subject from the raw, unescaped first line of the text', () => {
    const { subject } = buildOwnerEmailFields({
      ...BASE,
      text: 'the <save> button does nothing & it spins\nsecond line',
    })

    expect(subject).toBe('pond · problem reported: the <save> button does nothing & it spins')
  })

  it('HTML-escapes `<` and `&` in the text within the body', () => {
    const { html } = buildOwnerEmailFields({ ...BASE, text: 'the <save> button does nothing & it spins' })

    expect(html).toContain('the &lt;save&gt; button does nothing &amp; it spins')
    expect(html).not.toContain('<save>')
  })

  it('HTML-escapes `<` and `&` in the page title within the body', () => {
    const { html } = buildOwnerEmailFields({
      ...BASE,
      text: 'broken',
      pageTitle: '<notes> & plans',
    })

    expect(html).toContain('&lt;notes&gt; &amp; plans')
    expect(html).not.toContain('<notes>')
  })

  it('contains the reporter email, full text, page title, url, time, and Jira link', () => {
    const { html } = buildOwnerEmailFields({ ...BASE, text: 'the save button does nothing' })

    expect(html).toContain('reporter@example.com')
    expect(html).toContain('the save button does nothing')
    expect(html).toContain('electrician notes')
    expect(html).toContain('https://pond.example/workspace?nodeId=page-1')
    expect(html).toContain('2026-10-16T12:00:00.000Z')
    expect(html).toContain('https://pfaff-team.atlassian.net/browse/KAN-336')
  })

  it('keeps the full multi-line text, not just the first line', () => {
    const { html } = buildOwnerEmailFields({
      ...BASE,
      text: 'the save button does nothing\nit just spins',
    })

    expect(html).toContain('the save button does nothing<br>it just spins')
  })

  it('uses lowercase, structural copy with no marketing voice', () => {
    const { subject, html } = buildOwnerEmailFields({ ...BASE, text: 'broken' })

    expect(subject.startsWith('pond ·')).toBe(true)
    expect(subject).not.toMatch(/[A-Z]{2,}/)
    expect(html).not.toMatch(/!|act now|click here/i)
  })
})

describe('sendOwnerEmail', () => {
  const FIELDS = { subject: 'pond · problem reported: it spins', html: '<p>broken</p>' }
  const ENV_VARS = ['RESEND_API_KEY', 'OWNER_EMAIL'] as const

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'resend-secret'
    process.env.OWNER_EMAIL = 'cmp7cc@gmail.com'
  })

  afterEach(() => {
    for (const name of ENV_VARS) delete process.env[name]
    jest.restoreAllMocks()
  })

  it('POSTs to Resend with the right URL, headers, and body, and returns the id', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-123' }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await sendOwnerEmail(FIELDS)

    expect(mockFetch).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer resend-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pond <noreply@pond.tools>',
        to: 'cmp7cc@gmail.com',
        subject: FIELDS.subject,
        html: FIELDS.html,
      }),
      signal: expect.any(AbortSignal),
    })
    expect(result).toEqual({ id: 'email-123' })
  })

  it('throws when the response is ok but has no id', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(sendOwnerEmail(FIELDS)).rejects.toThrow('Resend returned no id')
  })

  it('throws with the reason when the response body is not valid JSON', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(sendOwnerEmail(FIELDS)).rejects.toThrow(/Unexpected end of JSON input/)
  })

  it('bounds the Resend request with a timeout signal', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-123' }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await sendOwnerEmail(FIELDS)

    const options = mockFetch.mock.calls[0][1] as RequestInit
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws with the reason when the request aborts on timeout', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'))
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(sendOwnerEmail(FIELDS)).rejects.toThrow(/TimeoutError|aborted/)
    const options = mockFetch.mock.calls[0][1] as RequestInit
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY
    const mockFetch = jest.fn()
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(sendOwnerEmail(FIELDS)).rejects.toThrow(/RESEND_API_KEY/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws with the reason when the response is not ok', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(sendOwnerEmail(FIELDS)).rejects.toThrow(/500/)
  })

  it('throws with the reason when fetch itself throws', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('network down'))
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(sendOwnerEmail(FIELDS)).rejects.toThrow(/network down/)
  })
})
