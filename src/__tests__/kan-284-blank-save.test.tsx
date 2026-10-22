/**
 * KAN-284 fix — AITerminal.tsx's autosave effect used to skip the WHOLE save
 * while the last assistant answer was blank, so a card decision made (or the
 * person's own next question sent) while that blank answer sat on screen
 * never persisted either; and once the thread moved past the blank answer
 * (a new question sent after it), the save resumed and carried the blank
 * message along, mid-thread. The fix filters blank assistant messages out of
 * what gets SAVED (by the shared `hasVisibleAssistantContent` predicate)
 * instead of gating the save on the last message alone.
 *
 * `@ai-sdk/react` and `@/lib/conversation/client` are both mocked (the same
 * pattern `propose-changes-flow-ui.test.tsx` uses) so `messages`/`status` are
 * fully under test control — no real streaming is needed to exercise the save
 * effect itself.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/context', () => {
  const active = {
    pond: { id: 'pond-7' },
    ponds: [],
    loading: false,
    reload: () => {},
    addPond: () => {},
  }
  return {
    ...jest.requireActual('@/lib/pond/context'),
    usePond: () => active,
    usePondId: () => active.pond.id,
  }
})
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Pond 7' }))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  collectionTitleResolver: () => () => undefined,
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: jest.fn().mockResolvedValue([]),
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  resolveChainStatuses: jest.fn().mockResolvedValue(new Map()),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn(),
  markOutdated: jest.fn(),
  listRecords: jest.fn().mockResolvedValue([]),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/change-log/resolve', () => ({ resolveChangeLogRecord: jest.fn() }))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
  useSessionUndo: () => ({ canUndo: false }),
}))
jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

const mockSaveTranscript = jest.fn().mockResolvedValue(undefined)
let mockResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: mockResolutions,
  })),
  saveTranscript: (...args: unknown[]) => mockSaveTranscript(...args),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
const mockSetMessages = jest.fn()
const mockAddToolOutput = jest.fn()
type MockMessage = { id: string; role: string; parts: Array<Record<string, unknown>> }
let mockMessages: MockMessage[] = []
let mockStatus = 'ready'
let mockError: Error | undefined
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
    addToolOutput: mockAddToolOutput,
    setMessages: mockSetMessages,
    status: mockStatus,
    error: mockError,
  })),
}))

global.fetch = jest
  .fn()
  .mockResolvedValue({ ok: true, json: async () => ({ extractions: [] }) } as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  )
  const result = render(wrap(ui))
  return { ...result, rerender: (node: React.ReactElement) => result.rerender(wrap(node)) }
}

async function ready() {
  openComposerIfClosed()
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

function textPart(text: string) {
  return { type: 'text', text }
}

/** An unresolved propose_changes card — renders with live accept/reject/request-changes buttons. */
function batch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'create', data: { type: 'text', content: `line of ${toolCallId}` } }],
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockStatus = 'ready'
  mockError = undefined
  mockMessages = []
})

describe('KAN-284 — the save guard filters blank answers out, instead of blocking the whole save', () => {
  it('a card decision still saves while the last answer is blank, and the saved transcript has no blank assistant message', async () => {
    const user = userEvent.setup()
    const u1: MockMessage = { id: 'u1', role: 'user', parts: [textPart('first question')] }
    const a1: MockMessage = { id: 'a1', role: 'assistant', parts: [batch('pc1')] }
    const u2: MockMessage = { id: 'u2', role: 'user', parts: [textPart('second question')] }
    const a2: MockMessage = { id: 'a2', role: 'assistant', parts: [textPart('')] }
    mockMessages = [u1, a1, u2, a2]

    renderWithQuery(<AITerminal />)
    await ready()

    // The propose_changes card is on the first (collapsed) turn; expand it.
    await user.click(screen.getByRole('button', { name: /earlier turn/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'reject' }))

    await waitFor(() => expect(mockSaveTranscript).toHaveBeenCalled())
    const lastCall = mockSaveTranscript.mock.calls[mockSaveTranscript.mock.calls.length - 1]
    // The saved transcript keeps the question + the card's own history, with only
    // the blank final answer filtered out — the card decision is not lost along
    // with it.
    expect(lastCall[2]).toEqual([u1, a1, u2])
  })

  it('a blank answer followed by a new question saves with the blank filtered out, not blocked', async () => {
    const u1: MockMessage = { id: 'u1', role: 'user', parts: [textPart('first question')] }
    const a1: MockMessage = { id: 'a1', role: 'assistant', parts: [textPart('')] }
    mockMessages = [u1, a1]

    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()

    // A new question sent while the blank answer sits on screen moves it
    // mid-thread — exactly what a real `sendMessage` would do to `messages`.
    const u2: MockMessage = { id: 'u2', role: 'user', parts: [textPart('second question')] }
    mockMessages = [...mockMessages, u2]
    rerender(<AITerminal />)

    await waitFor(() => expect(mockSaveTranscript).toHaveBeenCalled())
    const lastCall = mockSaveTranscript.mock.calls[mockSaveTranscript.mock.calls.length - 1]
    expect(lastCall[2]).toEqual([u1, u2])
  })
})
