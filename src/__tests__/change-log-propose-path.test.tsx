/**
 * KAN-316 — the ticket's own "Done when": a proposal made in the composer
 * shows in the change log's figure and list as soon as the page opens.
 * Mounts the REAL `AITerminal` and the REAL `ChangeLogPage` together under one
 * shared `QueryClient` (mirrors `kan-302-path.test.tsx`'s multi-component
 * harness), backing `@/lib/change-log/store`'s `listRecords`/`countWaiting`
 * reads with one shared in-memory fake array so the change log's own queries
 * see exactly what the stream "wrote". Exercises PATH_STEPS steps 1–2.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'life' }))

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

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({ id: 'conv-1', messages: [], resolutions: {} })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
  useSessionUndo: () => ({ canUndo: false }),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

// ── The one shared fake: every change-log read AITerminal and ChangeLogPage
// make goes through this array, so a record the stream "landed" is exactly
// what the already-open change log's own queries see — no manual refetch,
// no fake-timer advance past the default 30s staleTime. ────────────────────
let fakeChangeLog: ChangeLogRecord[] = []

function makeProposedRecord(toolCallId: string): ChangeLogRecord {
  const now = new Date().toISOString()
  return {
    id: `rec-${toolCallId}`,
    userId: 'user-1',
    pondId: 'pond-7',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId,
    read: null,
    links: {},
    transitions: [{ status: 'proposed', at: now, actor: 'pond' }],
    createdAt: now,
    statusAt: now,
  }
}

jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: jest.fn().mockResolvedValue([]),
  resolveChainStatuses: jest.fn().mockResolvedValue(new Map()),
  listRecords: jest.fn(
    async (_supabase: unknown, opts: { status?: string | string[] } = {}) => {
      let rows = [...fakeChangeLog]
      if (opts.status) {
        const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
        rows = rows.filter((r) => statuses.includes(r.status))
      }
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
  ),
  countWaiting: jest.fn(async () =>
    fakeChangeLog.filter((r) => r.status === 'proposed' || r.status === 'outdated').length
  ),
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
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'

function proposeBatch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'apple' } }],
    },
  }
}

function renderPath() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = () => (
    <QueryClientProvider client={queryClient}>
      <ChangeLogPage />
      <AITerminal />
    </QueryClientProvider>
  )
  const result = render(wrap())
  return { ...result, rerender: () => result.rerender(wrap()), queryClient }
}

beforeEach(() => {
  jest.clearAllMocks()
  fakeChangeLog = []
  mockMessages = []
  mockStatus = 'ready'
  mockError = undefined
  mockGetPage.mockReset().mockResolvedValue(null)
  mockListPages.mockReset().mockResolvedValue([])
})

describe('a proposal reaches the already-open change log within 30s, with no reload (KAN-316)', () => {
  it('increments the "N proposed, waiting on you" figure and lists the new row', async () => {
    const { rerender } = renderPath()

    await waitFor(() => expect(screen.getByTestId('change-log-waiting-count')).toHaveTextContent('0'))
    expect(screen.queryByTestId('change-log-status-rec-pc1')).not.toBeInTheDocument()

    // The stream lands the proposal: the server has written the record (the
    // fake array stands in for that write) at the exact moment the composer's
    // stream yields the tool part at `input-available`.
    fakeChangeLog.push(makeProposedRecord('pc1'))
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [proposeBatch('pc1')] }]
    rerender()

    await waitFor(() => expect(screen.getByTestId('change-log-waiting-count')).toHaveTextContent('1'))
    await waitFor(() => expect(screen.getByTestId('change-log-status-rec-pc1')).toBeInTheDocument())
  })
})
