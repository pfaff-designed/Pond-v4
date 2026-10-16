import { createJiraIssue, rankFirstInNowQueue } from './jira-client'
import type { FeedbackIssue } from './build-issue'

const ISSUE: FeedbackIssue = {
  summary: 'the save button does nothing',
  descriptionAdf: {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the save button does nothing' }] }],
  },
  labels: ['feedback', 'from-user'],
}

beforeEach(() => {
  process.env.JIRA_BASE_URL = 'https://pfaff-team.atlassian.net'
  process.env.JIRA_EMAIL = 'charles@example.com'
  process.env.JIRA_API_KEY = 'secret-key'
  global.fetch = jest.fn()
})

describe('createJiraIssue', () => {
  it('posts the right auth header and body', async () => {
    const mockedFetch = global.fetch as jest.Mock
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: 'KAN-900' }),
    })

    const result = await createJiraIssue(ISSUE)

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://pfaff-team.atlassian.net/rest/api/3/issue',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('charles@example.com:secret-key').toString('base64')}`,
        }),
      })
    )
    const body = JSON.parse(mockedFetch.mock.calls[0][1].body)
    expect(body).toEqual({
      fields: {
        project: { key: 'KAN' },
        issuetype: { name: 'Task' },
        summary: ISSUE.summary,
        description: ISSUE.descriptionAdf,
        labels: ISSUE.labels,
      },
    })
    expect(result).toEqual({ key: 'KAN-900', url: 'https://pfaff-team.atlassian.net/browse/KAN-900' })
  })
})

describe('rankFirstInNowQueue', () => {
  it('skips the rank call and returns false when the JQL result is empty', async () => {
    const mockedFetch = global.fetch as jest.Mock
    mockedFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ issues: [] }) })

    const ranked = await rankFirstInNowQueue('KAN-900')

    expect(ranked).toBe(false)
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('returns false without throwing when the rank call 4xxs', async () => {
    const mockedFetch = global.fetch as jest.Mock
    mockedFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ issues: [{ key: 'KAN-800' }] }) })
      .mockResolvedValueOnce({ ok: false, status: 400 })

    const ranked = await rankFirstInNowQueue('KAN-900')

    expect(ranked).toBe(false)
  })

  it('returns true on a successful rank', async () => {
    const mockedFetch = global.fetch as jest.Mock
    mockedFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ issues: [{ key: 'KAN-800' }] }) })
      .mockResolvedValueOnce({ ok: true })

    const ranked = await rankFirstInNowQueue('KAN-900')

    expect(ranked).toBe(true)
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'https://pfaff-team.atlassian.net/rest/agile/1.0/issue/rank',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ issues: ['KAN-900'], rankBeforeIssue: 'KAN-800' }),
      })
    )
  })
})
