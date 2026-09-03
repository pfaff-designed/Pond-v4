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
jest.mock('@ai-sdk/anthropic', () => {
  const anthropic = () => ({})
  anthropic.tools = { webSearch_20260209: () => ({}) }
  return { anthropic }
})
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
jest.mock('@/lib/context/assemble', () => ({
  buildChatContext: async () => null,
  // read_page's execute (ticket-30) calls these; the toolset assertions below only
  // need the tool to be registered, so stubs suffice.
  fetchNodeContext: async () => null,
  formatNodeContext: () => '',
}))
jest.mock('@/lib/embeddings/retrieve', () => ({
  retrievePages: async () => [],
  formatRetrievedPages: () => '',
}))
jest.mock('@/lib/ai/repair', () => ({ makeRepairToolCall: () => undefined }))

import { streamText } from 'ai'
import { POST, parseChatBody } from '@/app/api/chat/route'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>

describe('parseChatBody', () => {
  it('accepts a body with a messages array', () => {
    expect(parseChatBody({ messages: [] })).toEqual({
      messages: [],
      nodeId: undefined,
      nodeType: undefined,
      // ticket-39: the envelope now also carries question-card answers.
      // #17 slice 5: and define_schema decisions (`schemas`).
      resolutions: {
        changes: {},
        creates: {},
        schemas: {},
        rows: {},
        skipped: {},
        targets: {},
        questions: {},
      },
    })
  })

  it('carries nodeId / nodeType when they are strings', () => {
    const out = parseChatBody({ messages: [], nodeId: 'n1', nodeType: 'project' })
    expect(out?.nodeId).toBe('n1')
    expect(out?.nodeType).toBe('project')
  })

  it('carries card resolutions and degrades malformed ones to empty (ticket-19)', () => {
    const valid = parseChatBody({
      messages: [],
      resolutions: { changes: { 'pc1:0': 'accepted' }, creates: {}, skipped: {} },
    })
    expect(valid?.resolutions.changes).toEqual({ 'pc1:0': 'accepted' })

    const garbage = parseChatBody({ messages: [], resolutions: 'nope' })
    expect(garbage?.resolutions).toEqual({
      changes: {},
      creates: {},
      schemas: {},
      rows: {},
      skipped: {},
      targets: {},
      questions: {},
    })
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

describe('POST /api/chat toolset (ticket-30 cross-page edits)', () => {
  function post(body: Record<string, unknown>) {
    return POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
  }

  function lastStreamTextArgs() {
    const call = mockedStreamText.mock.calls.at(-1)
    expect(call).toBeDefined()
    return call![0] as unknown as { system: string; tools: Record<string, unknown> }
  }

  beforeEach(() => mockedStreamText.mockClear())

  it('offers propose_changes and read_page when a node is open', async () => {
    await post({ messages: [], nodeId: 'n1', nodeType: 'project' })
    const { tools } = lastStreamTextArgs()
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(['propose_changes', 'read_page', 'create_page', 'fetch_context'])
    )
  })

  it('still offers propose_changes and read_page when NO node is open (cross-page path)', async () => {
    await post({ messages: [] })
    const { tools } = lastStreamTextArgs()
    // Ticket-30: propose_changes is no longer withheld from Life home — the model
    // names another page by id and edits it. read_page loads that page's blocks.
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(['propose_changes', 'read_page', 'create_page', 'fetch_context'])
    )
  })
})
