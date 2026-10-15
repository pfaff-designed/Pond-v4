/**
 * KAN-316 — a propose_changes batch landing in the composer's stream must
 * invalidate changeLogKey() once the turn's stream finishes, not wait for a
 * decision via logDecision. Invalidating at 'input-available' races the
 * server-side write (/api/chat's onStepFinish), so the trigger is `status`
 * leaving 'streaming'/'submitted' for 'ready'. Same mocks as
 * propose-changes-flow-ui.test.tsx.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/context', () => {
  const active = { pond: { id: 'pond-7' }, ponds: [], loading: false, reload: () => {}, addPond: () => {} }
  return {
    ...jest.requireActual('@/lib/pond/context'),
    usePond: () => active,
    usePondId: () => active.pond.id,
  }
})

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

const mockGetPage = jest.fn().mockResolvedValue(null)
const mockListPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: (...args: unknown[]) => mockListPages(...args),
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

let mockResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
// `mockConversationMessages` (declared below with `mockMessages`): empty by
// default (nothing pre-seeded); a test that wants a message treated as
// re-seeded from a saved transcript (and so skipped by the invalidation
// effect) puts that message there instead of in the initial `mockMessages`.
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: mockConversationMessages,
    resolutions: mockResolutions,
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockListByCalls = jest.fn()
const mockGetRecordByToolCall = jest.fn().mockResolvedValue(null)
const mockAcceptRecord = jest.fn().mockResolvedValue(undefined)
const mockResolveChainStatus = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: (...args: unknown[]) => mockListByCalls(...args),
  resolveChainStatuses: async (
    supabase: unknown,
    opts: { userId: string; pondId: string | null; records: Array<{ id: string; status: string }> }
  ) => {
    const tips = new Map<string, string>()
    for (const record of opts.records) {
      tips.set(
        record.id,
        await mockResolveChainStatus(supabase, {
          userId: opts.userId,
          pondId: opts.pondId,
          recordId: record.id,
          status: record.status,
        })
      )
    }
    return tips
  },
  getRecordByToolCall: (...args: unknown[]) => mockGetRecordByToolCall(...args),
  advanceStatus: jest.fn(),
  acceptRecord: (...args: unknown[]) => mockAcceptRecord(...args),
  markOutdated: jest.fn(),
}))

jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
  useSessionUndo: () => ({ canUndo: false }),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
const mockAddToolOutput = jest.fn()
type MockMessage = {
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}
let mockMessages: MockMessage[] = []
let mockConversationMessages: MockMessage[] = []
// Stateful (unlike the repo's usual static useChat stub, per
// open-change-log-composer.test.tsx): the re-seeded-transcript test needs
// `messages` to reflect AITerminal's own `setMessages(conversation.messages)`
// call on the SAME render the mount effect sets `initialMessageIds`, not a
// value fixed before the conversation ever resolves.
const mockSetMessages = jest.fn((next: MockMessage[] | ((prev: MockMessage[]) => MockMessage[])) => {
  mockMessages = typeof next === 'function' ? next(mockMessages) : next
})

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

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { changeLogKey } from '@/lib/change-log/keys'

function batch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'create', data: { type: 'text', content: `first line of ${toolCallId}` } }],
    },
  }
}

/** Spies on invalidateQueries BEFORE mount: RTL's render flushes effects
 *  synchronously, so a spy attached after render would miss a mount-time call. */
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
  const rerenderWithClient = () =>
    result.rerender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { ...result, queryClient, invalidateSpy, rerenderWithClient }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockConversationMessages = []
  mockListByCalls.mockResolvedValue([])
  mockResolveChainStatus
    .mockReset()
    .mockImplementation((_sb: unknown, opts: { status: string }) => Promise.resolve(opts.status))
  mockGetRecordByToolCall.mockReset().mockResolvedValue(null)
  mockAcceptRecord.mockReset().mockResolvedValue(undefined)
  mockGetPage.mockReset().mockResolvedValue(null)
  mockListPages.mockReset().mockResolvedValue([])
  mockStatus = 'ready'
  mockError = undefined
  // Present from the first render — a fresh call, like propose-changes-flow-ui's default.
  mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1')] }]
})

describe('AITerminal invalidates the change log on a landed proposal (KAN-316)', () => {
  it('does not invalidate while the turn is still streaming, only once the stream reaches ready', async () => {
    // The tool-call input streams to the client mid-turn, before /api/chat's
    // onStepFinish has awaited the server-side write (route.ts:338) — so a
    // propose_changes part can sit at 'input-available' while `status` is
    // still 'streaming'. Invalidating here, before the write is guaranteed to
    // exist, is the race this fix closes.
    mockStatus = 'streaming'
    const { invalidateSpy, rerenderWithClient } = renderWithQuery(<AITerminal />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: changeLogKey() })

    mockStatus = 'ready'
    rerenderWithClient()

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() })
    )
    // Let the mount's conversation-load chain (getUser -> getOrCreateConversation
    // -> dispatch) fully settle before the next test mounts its own instance —
    // otherwise its belated state updates land mid-way through that test.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('flushes a staged proposal when the turn errors, not only when it reaches ready', async () => {
    // An earlier step's record is already written (onStepFinish runs per step,
    // not only at the end) — a later step erroring must not leave that record
    // waiting for the next turn to invalidate it.
    mockStatus = 'streaming'
    const { invalidateSpy, rerenderWithClient } = renderWithQuery(<AITerminal />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: changeLogKey() })

    mockStatus = 'error'
    mockError = new Error('boom')
    rerenderWithClient()

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() })
    )
  })

  it('does not invalidate for a proposal re-seeded from a saved transcript', async () => {
    // The message does not exist until the saved thread loads — unlike the
    // fresh-call case above, it must not be present from the first render.
    mockMessages = []
    mockConversationMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1')] }]
    mockResolutions = { changes: { 'pc1:0': 'accepted' }, creates: {}, skipped: {} }
    const { invalidateSpy } = renderWithQuery(<AITerminal />)

    // The mount effect seeds `setMessages` and `initialMessageIds` together;
    // wait for that restore to land before asserting nothing was invalidated.
    await waitFor(() => expect(mockSetMessages).toHaveBeenCalledWith(mockConversationMessages))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: changeLogKey() })
  })
})
