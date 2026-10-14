/**
 * @jest-environment node
 *
 * KAN-152 — a composer-made record must carry which thread it came from and
 * what Pond read, so the record page's "from thread" and "read" chips have
 * something to show. `threadId` rides the chat request body (AITerminal's
 * `conversationId`); `read` is this turn's open page (once its context
 * actually reached the model, KAN-99), every whole-page reference, and each
 * `read_page` tool call's page id. Same import stubs as
 * chat-request-changes.test.ts.
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
const mockGetUser = jest.fn(async () => ({ data: { user: { id: 'user-1' } } }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
jest.mock('@/lib/conversation/transcript', () => ({
  ...jest.requireActual('@/lib/conversation/transcript'),
  toModelMessages: async (m: unknown) => m,
}))
const mockFetchNodeContext = jest.fn(async (_sb: unknown, _userId: string, pageId: string) =>
  pageId === 'page-1' ? { type: 'page', title: 'kitchen renovation', documents: [], children: [] } : null
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

import { streamText } from 'ai'
import { recordProposedToolCalls } from '@/lib/change-log/propose'
import { resolveChangeLogRecord } from '@/lib/change-log/resolve'
import { POST } from '@/app/api/chat/route'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>
const mockedRecord = recordProposedToolCalls as jest.MockedFunction<typeof recordProposedToolCalls>
const mockedResolve = resolveChangeLogRecord as jest.MockedFunction<typeof resolveChangeLogRecord>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockedRecord.mockResolvedValue(1)
  mockedResolve.mockResolvedValue(null)
})

async function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

async function finishStep(toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>) {
  const args = mockedStreamText.mock.calls.at(-1)?.[0] as {
    onStepFinish?: (step: { toolCalls: unknown[] }) => Promise<void>
  }
  await args.onStepFinish?.({ toolCalls })
}

describe('POST /api/chat — thread id and read provenance (KAN-152)', () => {
  it('passes the body threadId as sourceThreadId', async () => {
    await post({ messages: [], threadId: 'thread-9' })
    await finishStep([{ toolCallId: 'c1', toolName: 'propose_changes', input: { changes: [] } }])
    expect(mockedRecord.mock.calls[0][1]).toMatchObject({ sourceThreadId: 'thread-9' })
  })

  it('writes sourceThreadId: null when the body carries no threadId', async () => {
    await post({ messages: [] })
    await finishStep([{ toolCallId: 'c1', toolName: 'propose_changes', input: { changes: [] } }])
    expect(mockedRecord.mock.calls[0][1]).toMatchObject({ sourceThreadId: null })
  })

  it('collects the open page, whole-page references and read_page calls into `read`', async () => {
    await post({
      messages: [],
      nodeId: 'page-1',
      openPageContext: true,
      references: [{ pageId: 'page-2', blockId: null, range: null, quotedText: '' }],
    })
    await finishStep([
      { toolCallId: 'r1', toolName: 'read_page', input: { pageId: 'page-3' } },
      { toolCallId: 'c1', toolName: 'propose_changes', input: { changes: [] } },
    ])
    const input = mockedRecord.mock.calls[0][1] as { read: string[] | null }
    expect(input.read).toEqual(expect.arrayContaining(['page-1', 'page-2', 'page-3']))
    expect(input.read).toHaveLength(3)
  })

  it('withholds the open page from `read` once its chip is dismissed (KAN-99)', async () => {
    await post({ messages: [], nodeId: 'page-1', openPageContext: false })
    await finishStep([{ toolCallId: 'c1', toolName: 'propose_changes', input: { changes: [] } }])
    expect(mockedRecord.mock.calls[0][1]).toMatchObject({ read: null })
  })
})
