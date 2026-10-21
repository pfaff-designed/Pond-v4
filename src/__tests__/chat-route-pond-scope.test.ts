/**
 * @jest-environment node
 *
 * KAN-341 item 7 — the route's own `fetchNodeContext` calls (the open page's
 * read, now that pond resolves once near the top of the handler) must carry
 * the resolved pond, the same as `buildChatContext`'s own calls (item 6).
 * The open page's read (`openPageData`) is fetched by the route itself and
 * handed to `buildChatContext` as `nodeData` — `buildChatContext` never
 * re-fetches it — so without this item, a node from another pond, or a
 * trashed one, still reads as that page's content here even though
 * `buildChatContext` alone (item 6's tests) already says "unavailable".
 * Runs the real `fetchNodeContext`/`buildChatContext` against the shared fake
 * Supabase (`fake-supabase.ts`, the same harness `context-assemble.test.ts`
 * uses for item 6) rather than mocking the DB layer away.
 */

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
jest.mock('@/lib/conversation/transcript', () => ({
  ...jest.requireActual('@/lib/conversation/transcript'),
  toModelMessages: async (m: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>) =>
    m.map((msg) => ({
      role: msg.role,
      content: msg.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('\n'),
    })),
}))
jest.mock('@/lib/context/paste-link', () => ({ fetchLinkContext: async () => null }))
jest.mock('@/lib/embeddings/retrieve', () => ({
  retrievePages: async () => [],
  formatRetrievedPages: () => '',
}))
jest.mock('@/lib/ai/repair', () => ({ makeRepairToolCall: () => undefined }))
jest.mock('@/lib/change-log/propose', () => ({ recordProposedToolCalls: jest.fn() }))
jest.mock('@/lib/change-log/resolve', () => ({ resolveChangeLogRecord: jest.fn() }))

import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/chat/route'
import { makeFakeSupabase, type Row } from './helpers/fake-supabase'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>
const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>

const page = (overrides: Partial<Row> = {}): Row => ({
  id: 'page-1',
  user_id: 'user-1',
  pond_id: 'pond-1',
  parent_id: null,
  type: 'page',
  title: 'the wild places',
  blocks: [],
  props: {},
  order: 0,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
})

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

/** The injected context (minus the persona/instructions `buildSystemPrompt` wraps it in). */
function assembledContext(system: string | undefined): string {
  return (system ?? '').split('Do not repeat it back verbatim unless asked.\n\n')[1] ?? ''
}

describe('POST /api/chat scopes the open page by pond before assembling context', () => {
  it('yields "[Current node] unavailable" for a node id that belongs to another pond, not that page\'s content', async () => {
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase([page()], undefined, { ponds: [{ id: 'pond-2', user_id: 'user-1', order: 0 }] }) as never
    )
    await post({
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is this?' }] }],
      nodeId: 'page-1',
      pondId: 'pond-2',
    })
    const args = mockedStreamText.mock.calls[0][0] as { system?: string }
    expect(args.system).toContain('[Current node] unavailable')
    expect(assembledContext(args.system)).not.toContain('the wild places')
  })

  it('yields "[Current node] unavailable" for a trashed node, even when the pond matches', async () => {
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase([page({ deleted_at: '2026-10-16T00:00:00Z' })], undefined, {
        ponds: [{ id: 'pond-1', user_id: 'user-1', order: 0 }],
      }) as never
    )
    await post({
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is this?' }] }],
      nodeId: 'page-1',
      pondId: 'pond-1',
    })
    const args = mockedStreamText.mock.calls[0][0] as { system?: string }
    // the trashed page is excluded from the current-node block, not from the
    // (untouched, out-of-scope) workspace outline below it — same known gap
    // as `context-assemble.test.ts`'s equivalent `buildChatContext` case.
    expect(assembledContext(args.system).split('\n\n')[0]).toBe('[Current node] unavailable')
  })

  it("reads the page's own content when the open page's pond matches", async () => {
    mockedCreateClient.mockResolvedValue(
      makeFakeSupabase([page()], undefined, { ponds: [{ id: 'pond-1', user_id: 'user-1', order: 0 }] }) as never
    )
    await post({
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'what is this?' }] }],
      nodeId: 'page-1',
      pondId: 'pond-1',
    })
    const args = mockedStreamText.mock.calls[0][0] as { system?: string }
    expect(args.system).toContain('the wild places')
    expect(args.system ?? '').not.toContain('[Current node] unavailable')
  })
})
