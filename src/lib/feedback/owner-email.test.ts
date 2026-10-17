import { buildOwnerEmailFields } from './owner-email'

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
