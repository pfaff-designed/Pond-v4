/**
 * @jest-environment node
 *
 * KAN-335: POST /api/feedback files a Jira issue for the signed-in caller's
 * report — 401 signed out, 400 on an empty/missing `text`, 503 when the Jira
 * env is missing, and an owner's report (`OWNER_EMAIL` match) gets
 * `now`/`size-S` and an attempted rank. `jira-client` is mocked — no network.
 */

let mockUser: { id: string; email: string } | null = {
  id: 'user-1',
  email: 'blank-slate-test@pond.local',
}
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })),
}))

const mockCreateJiraIssue = jest.fn()
const mockRankFirstInNowQueue = jest.fn()
const mockAddIssueComment = jest.fn()
jest.mock('@/lib/feedback/jira-client', () => ({
  createJiraIssue: (...args: unknown[]) => mockCreateJiraIssue(...args),
  rankFirstInNowQueue: (...args: unknown[]) => mockRankFirstInNowQueue(...args),
  addIssueComment: (...args: unknown[]) => mockAddIssueComment(...args),
}))

const mockBuildOwnerEmailFields = jest.fn()
const mockSendOwnerEmail = jest.fn()
jest.mock('@/lib/feedback/owner-email', () => ({
  buildOwnerEmailFields: (...args: unknown[]) => mockBuildOwnerEmailFields(...args),
  sendOwnerEmail: (...args: unknown[]) => mockSendOwnerEmail(...args),
}))

import { POST } from '@/app/api/feedback/route'
import { resetFilings } from '@/lib/feedback/idempotency'

const ENV_VARS = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_KEY', 'OWNER_EMAIL'] as const

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  mockUser = { id: 'user-1', email: 'blank-slate-test@pond.local' }
  mockCreateJiraIssue.mockReset()
  mockCreateJiraIssue.mockResolvedValue({
    key: 'KAN-900',
    url: 'https://pfaff-team.atlassian.net/browse/KAN-900',
  })
  mockRankFirstInNowQueue.mockReset()
  mockRankFirstInNowQueue.mockResolvedValue(true)
  mockAddIssueComment.mockReset()
  mockAddIssueComment.mockResolvedValue(true)
  mockBuildOwnerEmailFields.mockReset()
  mockBuildOwnerEmailFields.mockReturnValue({
    subject: 'pond · problem reported: the save button does nothing',
    html: '<p></p>',
  })
  mockSendOwnerEmail.mockReset()
  mockSendOwnerEmail.mockResolvedValue({ id: 'email-1' })
  process.env.JIRA_BASE_URL = 'https://pfaff-team.atlassian.net'
  process.env.JIRA_EMAIL = 'charles@example.com'
  process.env.JIRA_API_KEY = 'secret-key'
  process.env.OWNER_EMAIL = 'cmp7cc@gmail.com'
})

afterEach(() => {
  for (const name of ENV_VARS) delete process.env[name]
})

describe('POST /api/feedback', () => {
  it('returns 401 when there is no user', async () => {
    mockUser = null
    const res = await post({ text: 'the save button does nothing', url: 'https://pond.local/p' })
    expect(res.status).toBe(401)
    expect(mockCreateJiraIssue).not.toHaveBeenCalled()
  })

  it('returns 401, not 400, when signed out with an empty body', async () => {
    mockUser = null
    const res = await post({ text: '', url: 'https://pond.local/p' })
    expect(res.status).toBe(401)
    expect(mockCreateJiraIssue).not.toHaveBeenCalled()
  })

  it('returns 400 on invalid JSON', async () => {
    const res = await post('not json{')
    expect(res.status).toBe(400)
  })

  it('returns 400 when text is missing or empty', async () => {
    expect((await post({ url: 'https://pond.local/p' })).status).toBe(400)
    expect((await post({ text: '', url: 'https://pond.local/p' })).status).toBe(400)
    expect((await post({ text: '   ', url: 'https://pond.local/p' })).status).toBe(400)
  })

  it('returns 503 when a Jira env var is missing', async () => {
    delete process.env.JIRA_API_KEY
    const res = await post({ text: 'the save button does nothing', url: 'https://pond.local/p' })
    expect(res.status).toBe(503)
    expect(mockCreateJiraIssue).not.toHaveBeenCalled()
  })

  it("an owner's report gets now/size-S labels and an attempted rank", async () => {
    mockUser = { id: 'owner-1', email: 'CMP7CC@gmail.com' }
    const res = await post({ text: 'the save button does nothing', url: 'https://pond.local/p' })
    expect(res.status).toBe(200)
    expect(mockCreateJiraIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['feedback', 'from-owner', 'now', 'size-S'] })
    )
    expect(mockRankFirstInNowQueue).toHaveBeenCalledWith('KAN-900')
    expect(mockSendOwnerEmail).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({
      key: 'KAN-900',
      url: 'https://pfaff-team.atlassian.net/browse/KAN-900',
      rankFailed: false,
    })
  })

  it('returns 502 and never ranks when createJiraIssue throws', async () => {
    mockUser = { id: 'owner-1', email: 'CMP7CC@gmail.com' }
    mockCreateJiraIssue.mockRejectedValue(new Error('Jira issue creation failed: 400'))
    const res = await post({ text: 'the save button does nothing', url: 'https://pond.local/p' })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "can't file reports right now" })
    expect(mockRankFirstInNowQueue).not.toHaveBeenCalled()
  })

  it("a non-owner report's labels are exactly feedback/from-user, and rank is never attempted", async () => {
    const res = await post({ text: 'the save button does nothing', url: 'https://pond.local/p' })
    expect(res.status).toBe(200)
    expect(mockCreateJiraIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['feedback', 'from-user'] })
    )
    expect(mockRankFirstInNowQueue).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({
      key: 'KAN-900',
      url: 'https://pfaff-team.atlassian.net/browse/KAN-900',
      emailId: 'email-1',
    })
  })

  it('a non-owner report sends exactly one owner email with the right fields', async () => {
    const res = await post({
      text: 'the save button does nothing',
      url: 'https://pond.local/p',
      pageTitle: 'Save page',
    })
    expect(res.status).toBe(200)
    expect(mockSendOwnerEmail).toHaveBeenCalledTimes(1)
    expect(mockBuildOwnerEmailFields).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterEmail: 'blank-slate-test@pond.local',
        text: 'the save button does nothing',
        pageTitle: 'Save page',
        url: 'https://pond.local/p',
        jiraUrl: 'https://pfaff-team.atlassian.net/browse/KAN-900',
      })
    )
    expect(mockAddIssueComment).not.toHaveBeenCalled()
  })

  it('still returns 200 with emailFailed when sendOwnerEmail rejects, and posts the failure comment', async () => {
    mockSendOwnerEmail.mockRejectedValue(new Error('RESEND_API_KEY is missing'))
    const res = await post({ text: 'the save button does nothing', url: 'https://pond.local/p' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      key: 'KAN-900',
      url: 'https://pfaff-team.atlassian.net/browse/KAN-900',
      emailFailed: true,
    })
    expect(mockAddIssueComment).toHaveBeenCalledWith(
      'KAN-900',
      'owner email failed: RESEND_API_KEY is missing'
    )
  })

  // KAN-572: the composer's report card files through this route with an
  // edited summary and its tool call id as an idempotency key.
  describe('from the composer report card', () => {
    beforeEach(() => {
      resetFilings()
      mockUser = { id: 'composer-1', email: 'CMP7CC@gmail.com' }
    })

    const body = {
      summary: 'calendar opens on the wrong month',
      text: 'i opened the calendar in october and it showed june',
      pageId: 'page-1',
      pageTitle: 'kitchen reno',
      url: 'https://pond.local/p',
      idempotencyKey: 'call-1',
    }

    it("titles the issue with the card's summary and files it with now", async () => {
      const res = await post(body)
      expect(res.status).toBe(200)
      expect(mockCreateJiraIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'calendar opens on the wrong month',
          labels: expect.arrayContaining(['now', 'size-S']),
        })
      )
    })

    it('a second request with the same key files once and answers with the same ticket', async () => {
      const first = await post(body)
      const second = await post(body)
      expect(mockCreateJiraIssue).toHaveBeenCalledTimes(1)
      expect(await second.json()).toEqual(await first.json())
    })

    it('two requests in flight together with one key file once', async () => {
      const [a, b] = await Promise.all([post(body), post(body)])
      expect(mockCreateJiraIssue).toHaveBeenCalledTimes(1)
      expect((await a.json()).key).toBe('KAN-900')
      expect((await b.json()).key).toBe('KAN-900')
    })

    it('a different key files a second ticket', async () => {
      await post(body)
      await post({ ...body, idempotencyKey: 'call-2' })
      expect(mockCreateJiraIssue).toHaveBeenCalledTimes(2)
    })

    it('requests waiting on a failed filing retry it once, not once each', async () => {
      let fail: (e: Error) => void = () => {}
      mockCreateJiraIssue.mockImplementationOnce(
        () => new Promise((_resolve, reject) => (fail = reject))
      )
      const first = post(body)
      // Let the first request register its filing before the others arrive.
      await new Promise((r) => setTimeout(r, 0))
      const waiters = [post(body), post(body)]
      await new Promise((r) => setTimeout(r, 0))
      fail(new Error('jira down'))
      expect((await first).status).toBe(502)
      const answers = await Promise.all(waiters)
      expect(answers.map((r) => r.status)).toEqual([200, 200])
      expect(mockCreateJiraIssue).toHaveBeenCalledTimes(2)
    })

    it('a failed filing is forgotten, so a retry with the same key files', async () => {
      mockCreateJiraIssue.mockRejectedValueOnce(new Error('jira down'))
      expect((await post(body)).status).toBe(502)
      expect((await post(body)).status).toBe(200)
      expect(mockCreateJiraIssue).toHaveBeenCalledTimes(2)
    })
  })
})
