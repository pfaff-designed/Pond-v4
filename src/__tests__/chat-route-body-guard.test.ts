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
jest.mock('@/lib/conversation/transcript', () => ({
  ...jest.requireActual('@/lib/conversation/transcript'),
  toModelMessages: async (m: unknown) => m,
}))
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
import { POST } from '@/app/api/chat/route'
import { parseChatBody } from '@/app/api/chat/body'
import { SYSTEM_PROMPT, SYSTEM_PROMPT_WITHOUT_WEB } from '@/app/api/chat/prompt'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>

describe('parseChatBody', () => {
  it('accepts a body with a messages array', () => {
    expect(parseChatBody({ messages: [] })).toEqual({
      messages: [],
      nodeId: undefined,
      nodeType: undefined,
      // KAN-99: the open-page chip is on unless the person dismissed it.
      openPageContext: true,
      // #312: the pond scope of any change-log record this turn writes. Absent
      // when the body carries none — there is no default pond to fall back to.
      pondId: undefined,
      // Deep research is off unless the person turned it on for this question.
      research: false,
      // #98: no reference highlighted yet.
      references: [],
      // ticket-39: the envelope now also carries question-card answers.
      // #17 slice 5: and define_schema decisions (`schemas`).
      resolutions: {
        changes: {},
        creates: {},
        schemas: {},
        rows: {},
        promotions: {},
        views: {},
        links: {}, // #40: link_records decisions ride the same envelope
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

  it('carries the pond so the proposal is logged in the pond it came from (#312)', () => {
    // The change-log record the route writes is scoped per pond (user_id +
    // pond_id). The pond lives in the client's address, so it has to ride the
    // request — without it every proposal was filed into the first pond. This
    // replaces the `workspace` field 0020 retired.
    expect(parseChatBody({ messages: [], pondId: 'pond-2' })?.pondId).toBe('pond-2')
    // Anything that is not a string is not a pond id: omit it rather than
    // trusting it into the insert.
    expect(parseChatBody({ messages: [], pondId: 7 })?.pondId).toBeUndefined()
    expect(parseChatBody({ messages: [] })?.pondId).toBeUndefined()
  })

  it('carries research only when it is exactly true', () => {
    expect(parseChatBody({ messages: [], research: true })?.research).toBe(true)
    expect(parseChatBody({ messages: [], research: false })?.research).toBe(false)
    // Anything that is not a boolean true is off: the web is opt-in, never inferred.
    for (const research of ['true', 1, {}, [], null]) {
      expect(parseChatBody({ messages: [], research })?.research).toBe(false)
    }
  })

  it('drops the retired "area" nodeType (#108) rather than carrying it', () => {
    const out = parseChatBody({ messages: [], nodeId: 'n1', nodeType: 'area' })
    expect(out?.nodeId).toBe('n1')
    expect(out?.nodeType).toBeUndefined()
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
      promotions: {},
      views: {},
      links: {}, // #40: present-but-empty on a malformed body
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

  it('offers open_change_log so the composer can navigate there (KAN-94)', async () => {
    await post({ messages: [] })
    expect(Object.keys(lastStreamTextArgs().tools)).toContain('open_change_log')
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

  it('keeps the web out of the request by default', async () => {
    await post({ messages: [] })
    expect(Object.keys(lastStreamTextArgs().tools)).not.toContain('web_search')
  })

  it('offers web_search only when research is on for the question', async () => {
    await post({ messages: [], research: true })
    expect(Object.keys(lastStreamTextArgs().tools)).toContain('web_search')
  })

  it.each(['true', 1, null, {}])('does not read research: %p as on', async (research) => {
    await post({ messages: [], research })
    expect(Object.keys(lastStreamTextArgs().tools)).not.toContain('web_search')
  })

  it('composes the RESEARCH section into the system prompt only when research is on', async () => {
    await post({ messages: [] })
    expect(lastStreamTextArgs().system).toBe(SYSTEM_PROMPT_WITHOUT_WEB)
    expect(lastStreamTextArgs().system).not.toContain('web_search')

    await post({ messages: [], research: true })
    expect(lastStreamTextArgs().system).toBe(SYSTEM_PROMPT)
    expect(lastStreamTextArgs().system).toContain('You have a web_search tool')
  })

  describe('replaying a research turn', () => {
    const searched = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what do worktops cost?' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'dynamic-tool',
            toolName: 'web_search',
            toolCallId: 'srvtoolu_01',
            state: 'output-available',
            input: { query: 'worktop prices' },
            output: [],
            providerExecuted: true,
          },
          { type: 'text', text: 'About 300 a metre.' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'and fitting?' }] },
    ]
    const partTypes = () =>
      (
        lastStreamTextArgs() as unknown as { messages: Array<{ parts: Array<{ type: string }> }> }
      ).messages.flatMap((m) => m.parts.map((p) => p.type))

    it('keeps the search parts while research is on', async () => {
      await post({ messages: searched, research: true })
      expect(partTypes()).toContain('dynamic-tool')
    })

    it('strips them, and keeps the answer text, when research is off', async () => {
      await post({ messages: searched })
      expect(partTypes()).not.toContain('dynamic-tool')
      expect(partTypes()).toContain('text')
    })
  })

  it('leaves every other tool in place either way', async () => {
    await post({ messages: [] })
    const off = Object.keys(lastStreamTextArgs().tools).sort()
    await post({ messages: [], research: true })
    const on = Object.keys(lastStreamTextArgs().tools).sort()
    expect(on.filter((name) => name !== 'web_search')).toEqual(off)
  })
})
