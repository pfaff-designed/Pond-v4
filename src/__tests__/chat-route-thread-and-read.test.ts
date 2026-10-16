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
jest.mock('@/lib/change-log/store', () => ({ listRecordsByToolCalls: jest.fn() }))

import { streamText } from 'ai'
import { recordProposedToolCalls } from '@/lib/change-log/propose'
import { resolveChangeLogRecord } from '@/lib/change-log/resolve'
import { listRecordsByToolCalls } from '@/lib/change-log/store'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { POST } from '@/app/api/chat/route'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>
const mockedRecord = recordProposedToolCalls as jest.MockedFunction<typeof recordProposedToolCalls>
const mockedResolve = resolveChangeLogRecord as jest.MockedFunction<typeof resolveChangeLogRecord>
const mockedListByToolCalls = listRecordsByToolCalls as jest.MockedFunction<typeof listRecordsByToolCalls>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockedRecord.mockResolvedValue(1)
  mockedResolve.mockResolvedValue(null)
  mockedListByToolCalls.mockResolvedValue([])
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

function rejectedRecord(overrides: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: null,
    status: 'rejected',
    action: 'edit',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: 'tc-rejected',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    statusAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

const proposeMessage = (toolCallId: string) => ({
  id: 'm-1',
  role: 'assistant' as const,
  parts: [{ type: 'tool-propose_changes', toolCallId, state: 'input-available', input: { changes: [] } }],
})

describe('POST /api/chat — no-retry [Rejected] context (KAN-132)', () => {
  // ROUTING's own rule text always names "[Rejected]" as the section to watch for
  // (prompt.ts), so these assertions check for the injected block's body, not the
  // bracketed word alone.
  const REJECTED_BLOCK_OPENER = 'has already rejected these edits in this thread'

  it('names a rejected record in the system prompt when its tool call is in `messages`', async () => {
    mockedListByToolCalls.mockResolvedValue([rejectedRecord()])
    await post({ messages: [proposeMessage('tc-rejected')] })
    const args = mockedStreamText.mock.calls.at(-1)?.[0] as { system: string }
    expect(args.system).toContain(REJECTED_BLOCK_OPENER)
    expect(args.system).toContain('kitchen renovation')
  })

  it('omits the block when `listRecordsByToolCalls` returns nothing', async () => {
    mockedListByToolCalls.mockResolvedValue([])
    await post({ messages: [proposeMessage('tc-rejected')] })
    const args = mockedStreamText.mock.calls.at(-1)?.[0] as { system: string }
    expect(args.system).not.toContain(REJECTED_BLOCK_OPENER)
  })

  it('omits the block when the matching record is not rejected', async () => {
    mockedListByToolCalls.mockResolvedValue([rejectedRecord({ status: 'proposed' })])
    await post({ messages: [proposeMessage('tc-rejected')] })
    const args = mockedStreamText.mock.calls.at(-1)?.[0] as { system: string }
    expect(args.system).not.toContain(REJECTED_BLOCK_OPENER)
  })

  it('never looks the record up when no proposal tool call is in `messages`', async () => {
    await post({ messages: [{ id: 'm-0', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] })
    expect(mockedListByToolCalls).not.toHaveBeenCalled()
  })

  it('still streams and omits the block when `listRecordsByToolCalls` rejects', async () => {
    mockedListByToolCalls.mockRejectedValue(new Error('change_log read failed'))
    await post({ messages: [proposeMessage('tc-rejected')] })
    expect(mockedStreamText).toHaveBeenCalled()
    const args = mockedStreamText.mock.calls.at(-1)?.[0] as { system: string }
    expect(args.system).not.toContain(REJECTED_BLOCK_OPENER)
  })
})
