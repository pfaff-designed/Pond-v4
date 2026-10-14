/**
 * @jest-environment node
 *
 * KAN-309 — `/api/chat` attaches the open page's current text to the LAST user
 * message, so a thread whose history still carries an earlier (now accepted)
 * `propose_changes` call targets what the page reads NOW, not that call's
 * stale input. Reuses the node read `buildChatContext` already does (one
 * `fetchNodeContext` call, read below) rather than a second DB read. Same
 * import stubs as chat-route-body-guard.test.ts, except `convertToModelMessages`
 * (from the real `ai` module) does the UIMessage → ModelMessage conversion for
 * real, so the history's accepted tool call and the final user text land in
 * `modelMessages` exactly as production builds them.
 */

jest.mock('@ai-sdk/anthropic', () => {
  const anthropic = () => ({})
  anthropic.tools = { webSearch_20260209: () => ({}) }
  return { anthropic }
})
jest.mock('ai', () => {
  const actual = jest.requireActual('ai')
  return {
    ...actual,
    streamText: jest.fn(() => ({ toUIMessageStreamResponse: () => new Response('ok') })),
    tool: (t: unknown) => t,
    stepCountIs: () => 10,
  }
})
const mockGetUser = jest.fn(async () => ({ data: { user: { id: 'user-1' } } }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
const mockFetchNodeContext = jest.fn(async (_sb: unknown, _userId: string, pageId: string) =>
  pageId === 'page-1'
    ? {
        type: 'page',
        title: 'kan309 probe',
        documents: [{ title: 'kan309 probe', blocks: [{ id: 'b1', type: 'text', content: 'Hello kiwi' }] }],
        children: [],
      }
    : null
)
jest.mock('@/lib/context/assemble', () => ({
  buildChatContext: async () => null,
  fetchNodeContext: (...args: [unknown, string, string]) => mockFetchNodeContext(...args),
  formatNodeContext: () => '',
}))
jest.mock('@/lib/context/paste-link', () => ({ fetchLinkContext: async () => null }))
jest.mock('@/lib/embeddings/retrieve', () => ({
  retrievePages: async () => [],
  formatRetrievedPages: () => '',
}))
jest.mock('@/lib/ai/repair', () => ({ makeRepairToolCall: () => undefined }))
jest.mock('@/lib/change-log/propose', () => ({ recordProposedToolCalls: jest.fn() }))
jest.mock('@/lib/change-log/resolve', () => ({ resolveChangeLogRecord: jest.fn() }))

import type { ModelMessage } from 'ai'
import { streamText } from 'ai'
import { POST } from '@/app/api/chat/route'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
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

function lastStreamTextArgs() {
  const call = mockedStreamText.mock.calls.at(-1)
  expect(call).toBeDefined()
  return call![0] as unknown as { messages: ModelMessage[] }
}

describe('POST /api/chat targets the page as it reads now', () => {
  // History: the user asked for "world" -> "moon"; Pond proposed it and the
  // user accepted; then, in the SAME thread, the user asks to change "kiwi"
  // (the page's current text, edited by hand after the accept) to "fig".
  const historyWithAcceptedMoonProposal = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'change world to moon' }] },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-propose_changes',
          toolCallId: 'pc1',
          state: 'input-available',
          input: {
            targetPageId: 'page-1',
            changes: [{ op: 'edit', blockId: 'b1', data: { type: 'text', content: 'Hello moon' } }],
          },
        },
      ],
    },
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'change kiwi to fig' }] },
  ]

  it("carries the page's current 'Hello kiwi' text on the last user message, not the stale 'Hello moon' proposal (fails on main)", async () => {
    await post({
      messages: historyWithAcceptedMoonProposal,
      nodeId: 'page-1',
      nodeType: 'page',
      resolutions: { changes: { 'pc1:0': 'accepted' }, creates: {}, skipped: {} },
    })

    const { messages } = lastStreamTextArgs()
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    expect(lastUser).toBeDefined()
    const text =
      typeof lastUser!.content === 'string'
        ? lastUser!.content
        : (lastUser!.content as Array<{ type: string; text?: string }>)
            .map((p) => p.text ?? '')
            .join('\n')

    expect(text).toContain('Hello kiwi')
  })

  it('reads the open node once (no second DB read for the same page)', async () => {
    await post({
      messages: historyWithAcceptedMoonProposal,
      nodeId: 'page-1',
      nodeType: 'page',
      resolutions: { changes: { 'pc1:0': 'accepted' }, creates: {}, skipped: {} },
    })

    expect(mockFetchNodeContext).toHaveBeenCalledTimes(1)
  })
})
