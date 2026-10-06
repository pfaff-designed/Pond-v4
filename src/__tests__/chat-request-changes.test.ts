/**
 * @jest-environment node
 *
 * #98 — request changes reaches Pond through the chat route.
 *
 * The card's note rides the request body as `requestChanges`; the route (1)
 * lands the `changes_requested` decision on the record, (2) tells the model, in
 * a context block, that this turn answers a request-changes note and must come
 * back as a REVISED propose_changes, and (3) links the revision it then emits to
 * the original record. Same import stubs as chat-route-body-guard.test.ts.
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
jest.mock('@/lib/context/assemble', () => ({
  buildChatContext: async () => null,
  fetchNodeContext: async () => null,
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
import { POST, parseChatBody } from '@/app/api/chat/route'
import { parseRequestChanges, requestChangesContextNote } from '@/app/api/chat/request-changes'

const mockedStreamText = streamText as jest.MockedFunction<typeof streamText>
const mockedRecord = recordProposedToolCalls as jest.MockedFunction<typeof recordProposedToolCalls>
const mockedResolve = resolveChangeLogRecord as jest.MockedFunction<typeof resolveChangeLogRecord>

beforeEach(() => {
  jest.clearAllMocks()
  mockedRecord.mockResolvedValue(1)
  mockedResolve.mockResolvedValue(null)
})

describe('parseRequestChanges', () => {
  it('reads a well-formed note', () => {
    expect(
      parseRequestChanges({ toolCallId: 'pc1', note: 'keep the electrician', reason: 'note' })
    ).toEqual({ toolCallId: 'pc1', note: 'keep the electrician', reason: 'note' })
    expect(parseRequestChanges({ toolCallId: 'pc1', note: 'x', reason: 'outdated' })?.reason).toBe(
      'outdated'
    )
  })

  it('drops anything malformed rather than trusting it', () => {
    expect(parseRequestChanges(undefined)).toBeUndefined()
    expect(parseRequestChanges({ toolCallId: 'pc1' })).toBeUndefined()
    expect(parseRequestChanges({ toolCallId: '', note: 'x', reason: 'note' })).toBeUndefined()
    expect(parseRequestChanges({ toolCallId: 'pc1', note: '   ', reason: 'note' })).toBeUndefined()
    expect(parseRequestChanges({ toolCallId: 'pc1', note: 'x', reason: 'weird' })).toBeUndefined()
  })

  it('rides parseChatBody as an optional field', () => {
    expect(parseChatBody({ messages: [] })).not.toHaveProperty('requestChanges')
    expect(
      parseChatBody({
        messages: [],
        requestChanges: { toolCallId: 'pc1', note: 'drop the worktop', reason: 'note' },
      })?.requestChanges
    ).toEqual({ toolCallId: 'pc1', note: 'drop the worktop', reason: 'note' })
  })
})

describe('requestChangesContextNote', () => {
  it('tells the model which proposal the note answers and asks for a revised diff', () => {
    const note = requestChangesContextNote({
      toolCallId: 'pc1',
      note: 'keep the electrician, drop the worktop',
      reason: 'note',
    })
    expect(note).toContain('[Request changes]')
    expect(note).toContain('pc1')
    expect(note).toContain('keep the electrician, drop the worktop')
    expect(note).toMatch(/revised/i)
    expect(note).toMatch(/propose_changes/)
  })

  it('an outdated revise says the page moved on, so the model re-reads it', () => {
    const note = requestChangesContextNote({
      toolCallId: 'pc1',
      note: 'revise',
      reason: 'outdated',
    })
    expect(note).toMatch(/outdated/i)
    expect(note).toMatch(/as it (now )?stands/i)
  })
})

describe('POST /api/chat with requestChanges', () => {
  const body = {
    messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'drop the worktop' }] }],
    nodeId: 'page-1',
    pondId: 'pond-1',
    requestChanges: { toolCallId: 'pc-orig', note: 'drop the worktop', reason: 'note' },
  }

  async function post() {
    return POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
  }

  it('lands the changes_requested decision on the original record', async () => {
    await post()
    expect(mockedResolve).toHaveBeenCalledTimes(1)
    expect(mockedResolve.mock.calls[0][1]).toEqual({
      userId: 'user-1',
      pondId: 'pond-1',
      toolCallId: 'pc-orig',
      decision: 'changes_requested',
    })
  })

  it('injects the request-changes note into the system prompt', async () => {
    await post()
    const args = mockedStreamText.mock.calls[0][0] as { system?: string }
    expect(args.system).toContain('[Request changes]')
    expect(args.system).toContain('drop the worktop')
  })

  it('links the revision the model emits to the original call', async () => {
    await post()
    const args = mockedStreamText.mock.calls[0][0] as {
      onStepFinish?: (step: { toolCalls: unknown[] }) => Promise<void>
    }
    await args.onStepFinish?.({
      toolCalls: [{ toolCallId: 'pc-rev', toolName: 'propose_changes', input: { changes: [] } }],
    })
    expect(mockedRecord).toHaveBeenCalledTimes(1)
    expect(mockedRecord.mock.calls[0][1]).toMatchObject({
      userId: 'user-1',
      revisesToolCallId: 'pc-orig',
    })
  })

  it('an ordinary turn carries no revision link', async () => {
    const { requestChanges: _drop, ...plain } = body
    void _drop
    await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plain),
      })
    )
    expect(mockedResolve).not.toHaveBeenCalled()
    const args = mockedStreamText.mock.calls[0][0] as {
      system?: string
      onStepFinish?: (step: { toolCalls: unknown[] }) => Promise<void>
    }
    expect(args.system ?? '').not.toContain('[Request changes]')
    await args.onStepFinish?.({
      toolCalls: [{ toolCallId: 'pc-new', toolName: 'propose_changes', input: { changes: [] } }],
    })
    expect(mockedRecord.mock.calls[0][1].revisesToolCallId ?? null).toBeNull()
  })
})
