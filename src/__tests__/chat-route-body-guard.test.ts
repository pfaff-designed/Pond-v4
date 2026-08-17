/**
 * @jest-environment node
 *
 * M1 cheap hardening: POST /api/chat must not 500 on a malformed body. The route
 * guards the request shape and returns 400 for bad JSON or a missing `messages`
 * array. We test the pure guard (`parseChatBody`) plus the POST 400 path, mocking
 * the route's server-only deps so it imports without a live server/session. Runs in
 * the `node` environment so the web `Request`/`Response` globals are real.
 */

// The route pulls in server-only + AI-SDK modules at import time; stub them so the
// test can import the handler without a live server/session.
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: () => ({}) }))
jest.mock('ai', () => ({
  streamText: jest.fn(() => ({ toUIMessageStreamResponse: () => new Response('ok') })),
  tool: (t: unknown) => t,
  stepCountIs: () => 1,
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}))
jest.mock('@/lib/conversation/transcript', () => ({ toModelMessages: async (m: unknown) => m }))
jest.mock('@/lib/context/assemble', () => ({ buildChatContext: async () => null }))
jest.mock('@/lib/embeddings/retrieve', () => ({
  retrievePages: async () => [],
  formatRetrievedPages: () => '',
}))
jest.mock('@/lib/ai/repair', () => ({ makeRepairToolCall: () => undefined }))

import { POST, parseChatBody } from '@/app/api/chat/route'

describe('parseChatBody', () => {
  it('accepts a body with a messages array', () => {
    expect(parseChatBody({ messages: [] })).toEqual({
      messages: [],
      nodeId: undefined,
      nodeType: undefined,
    })
  })

  it('carries nodeId / nodeType when they are strings', () => {
    const out = parseChatBody({ messages: [], nodeId: 'n1', nodeType: 'project' })
    expect(out?.nodeId).toBe('n1')
    expect(out?.nodeType).toBe('project')
  })

  it('rejects a non-object body', () => {
    expect(parseChatBody(null)).toBeNull()
    expect(parseChatBody('nope')).toBeNull()
  })

  it('rejects a body with no messages array', () => {
    expect(parseChatBody({})).toBeNull()
    expect(parseChatBody({ messages: 'not-an-array' })).toBeNull()
  })
})

describe('POST /api/chat body guard', () => {
  it('returns 400 on invalid JSON instead of 500', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: 'not json{',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when messages is missing', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: 'n1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
