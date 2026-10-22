/**
 * @jest-environment node
 *
 * POST /api/bug files a GitHub issue and starts the cloud agent for the
 * signed-in caller. fileBug is mocked — no network.
 */

let mockUser: { id: string } | null = { id: 'user-1' }
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })),
}))

const mockFileBug = jest.fn()
jest.mock('@/lib/bug/file-bug', () => {
  class BugSessionError extends Error {
    readonly issueUrl: string
    constructor(issueUrl: string) {
      super('the issue is open and the agent did not start')
      this.issueUrl = issueUrl
    }
  }
  return {
    BugSessionError,
    bugConfigFromEnv: () => ({ agentId: 'agent_1' }),
    fileBug: (...args: unknown[]) => mockFileBug(...args),
  }
})

import { POST, resetBugRateLimit } from '@/app/api/bug/route'

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/bug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockFileBug.mockReset()
  mockFileBug.mockResolvedValue({
    issueUrl: 'https://github.com/pfaff-designed/Pond-v4/issues/12',
    sessionId: 'sesn_1',
    transcriptUrl: 'https://platform.claude.com/workspaces/default/sessions/sesn_1',
  })
  resetBugRateLimit()
})

describe('POST /api/bug', () => {
  it('returns 401 when there is no user', async () => {
    mockUser = null
    const res = await post({ report: 'login 500s' })
    expect(res.status).toBe(401)
    expect(mockFileBug).not.toHaveBeenCalled()
  })

  it('returns 400 when the report is empty', async () => {
    const res = await post({ report: '   ' })
    expect(res.status).toBe(400)
    expect(mockFileBug).not.toHaveBeenCalled()
  })

  it('returns the issue and the transcript', async () => {
    const res = await post({ report: 'login 500s when the cookie is missing' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { issueUrl: string; sessionId: string }
    expect(body.issueUrl).toContain('issues/12')
    expect(body.sessionId).toBe('sesn_1')
    expect(mockFileBug).toHaveBeenCalledWith(
      'login 500s when the cookie is missing',
      expect.anything()
    )
  })

  it('returns the issue url when the agent does not start', async () => {
    const { BugSessionError } = jest.requireMock('@/lib/bug/file-bug') as {
      BugSessionError: new (issueUrl: string) => Error
    }
    mockFileBug.mockRejectedValue(
      new BugSessionError('https://github.com/pfaff-designed/Pond-v4/issues/13')
    )
    const res = await post({ report: 'login 500s' })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { issueUrl: string }
    expect(body.issueUrl).toContain('issues/13')
  })
})
