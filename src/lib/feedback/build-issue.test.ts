import { buildFeedbackIssue } from './build-issue'

const BASE = {
  pageId: 'page-1',
  pageTitle: 'electrician notes',
  url: 'https://pond.example/workspace?nodeId=page-1',
  reporterEmail: 'reporter@example.com',
  userAgent: 'Mozilla/5.0',
  now: new Date('2026-10-16T12:00:00.000Z'),
  isOwner: false,
}

describe('buildFeedbackIssue', () => {
  it('truncates a long first line to 80 characters for the summary', () => {
    const longLine = 'a'.repeat(120)
    const { summary } = buildFeedbackIssue({ ...BASE, text: longLine })

    expect(summary).toHaveLength(80)
    expect(summary).toBe('a'.repeat(80))
  })

  it('takes only the trimmed first line of multi-line text as the summary', () => {
    const { summary } = buildFeedbackIssue({
      ...BASE,
      text: '  the save button does nothing  \nsecond line\nthird line',
    })

    expect(summary).toBe('the save button does nothing')
  })

  it('builds a minimal ADF doc with the full text and each detail its own paragraph', () => {
    const { descriptionAdf } = buildFeedbackIssue({
      ...BASE,
      text: 'the save button does nothing\nit just spins',
    })

    expect(descriptionAdf).toEqual({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'the save button does nothing\nit just spins' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'reporter: reporter@example.com' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'page: electrician notes' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'url: https://pond.example/workspace?nodeId=page-1' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'user agent: Mozilla/5.0' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'time: 2026-10-16T12:00:00.000Z' }] },
      ],
    })
  })

  it('labels a non-owner report feedback and from-user', () => {
    const { labels } = buildFeedbackIssue({ ...BASE, text: 'broken', isOwner: false })

    expect(labels).toEqual(['feedback', 'from-user'])
  })

  it('labels an owner report feedback and from-owner', () => {
    const { labels } = buildFeedbackIssue({ ...BASE, text: 'broken', isOwner: true })

    expect(labels).toEqual(['feedback', 'from-owner'])
  })
})

describe('buildFeedbackIssue with an explicit summary (KAN-572)', () => {
  it("uses the composer card's summary over the text's first line", () => {
    const { summary } = buildFeedbackIssue({
      ...BASE,
      summary: ' calendar opens on the wrong month ',
      text: 'i opened it in october\nit showed june',
    })
    expect(summary).toBe('calendar opens on the wrong month')
  })

  it('falls back to the first line when the summary is blank', () => {
    const { summary } = buildFeedbackIssue({ ...BASE, summary: '  ', text: 'first\nsecond' })
    expect(summary).toBe('first')
  })
})
