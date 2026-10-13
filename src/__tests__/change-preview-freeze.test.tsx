/**
 * KAN-302 — a propose_changes card freezes its "−"/"+" text the moment its
 * batch leaves pending. Mocks mirror propose-changes-flow-ui.test.tsx; the
 * difference is an OPEN page (`nodeId` set), so an `edit` op's `before` reads
 * a real block instead of always resolving against an empty array.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({
    get: (key: string) => ({ nodeId: 'page-1', nodeName: 'Plans', nodeType: 'page' })[key] ?? null,
  }),
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

const PAGE_ID = 'page-1'
const mockGetPage = jest.fn()
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
const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

let mockResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: mockResolutions,
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockListByCalls = jest.fn().mockResolvedValue([])
// KAN-302: `resolveChainStatuses` (the production call site now) walks this
// same per-record mock over the batch and collects it into a Map.
const mockResolveChainStatus = jest
  .fn()
  .mockImplementation((_sb: unknown, opts: { status: string }) => Promise.resolve(opts.status))
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
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn().mockResolvedValue(undefined),
  markOutdated: jest.fn(),
}))

jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

const mockSendMessage = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}> = []

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
    error: undefined,
  })),
}))

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

import { AITerminal } from '@/components/organisms/AITerminal'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  )
  const result = render(wrap(ui))
  return {
    ...result,
    queryClient,
    rerender: (node: React.ReactElement) => result.rerender(wrap(node)),
  }
}

function pageDoc(content: string) {
  return {
    id: PAGE_ID,
    parentId: null,
    type: 'page',
    title: 'Plans',
    blocks: [{ id: 'b1', type: 'text', content }],
    props: {},
    order: 0,
  }
}

function editBatch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'edit', blockId: 'b1', data: { type: 'text', content: 'Hello moon' } }],
    },
  }
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockGetPage.mockResolvedValue(pageDoc('Hello world'))
  mockListPages.mockResolvedValue([])
  mockCommitBlocks.mockResolvedValue(undefined)
  mockListByCalls.mockReset().mockResolvedValue([])
  mockResolveChainStatus
    .mockReset()
    .mockImplementation((_sb: unknown, opts: { status: string }) => Promise.resolve(opts.status))
  mockMessages = [{ id: 'm1', role: 'assistant', parts: [editBatch('pc1')] }]
})

describe('KAN-302 — an accepted card freezes its diff text', () => {
  it('a later page edit no longer rewrites an already-accepted card', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderWithQuery(<AITerminal />)
    await ready()

    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Hello moon')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /proposed edit/ })).toHaveAttribute(
        'data-status',
        'accepted'
      )
    )

    // Simulate a further edit landing on the SAME page after the accept settled —
    // force the ['page', PAGE_ID] cache the card reads `currentPage` from to refetch.
    const callsBeforeEdit = mockGetPage.mock.calls.length
    mockGetPage.mockResolvedValue(pageDoc('Hello world xyz'))
    await queryClient.invalidateQueries({ queryKey: ['page', PAGE_ID] })
    await waitFor(() => expect(mockGetPage.mock.calls.length).toBeGreaterThan(callsBeforeEdit))
    expect(queryClient.getQueryData(['page', PAGE_ID])).toEqual(pageDoc('Hello world xyz'))

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('Hello moon')).toBeInTheDocument()
      expect(screen.queryByText('Hello world xyz')).not.toBeInTheDocument()
    })
  })
})

// The in-session freeze above (component state) does not survive a RELOAD: a
// fresh mount re-seeds the card straight to `accepted` with an empty cache, so
// without this fix it would recompute against the LIVE page and freeze
// "Hello moon xyz" (the further edit) as if it were the original "before".
describe('KAN-302 — a settled card reads its "before" off the change-log record', () => {
  it('a fresh mount of an already-accepted card shows the record\'s before, not the further-edited live page', async () => {
    mockResolutions = { changes: { 'pc1:0': 'accepted' }, creates: {}, skipped: {} }
    // The live page has moved on since the edit was accepted (someone typed
    // " xyz" after it landed) — this must NOT be what the "−" line shows.
    mockGetPage.mockResolvedValue(pageDoc('Hello moon xyz'))
    mockListByCalls.mockResolvedValue([
      {
        id: 'rec-1',
        toolCallId: 'pc1',
        status: 'accepted',
        action: 'edit',
        before: [{ id: 'b1', type: 'text', content: 'Hello world' }],
        after: [{ id: 'b1', type: 'text', content: 'Hello moon' }],
      },
    ])

    renderWithQuery(<AITerminal />)
    await ready()

    await waitFor(() =>
      expect(screen.getByRole('group', { name: /proposed edit/ })).toHaveAttribute(
        'data-status',
        'accepted'
      )
    )
    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument())
    expect(screen.getByText('Hello moon')).toBeInTheDocument()
    expect(screen.queryByText('Hello moon xyz')).not.toBeInTheDocument()
  })
})
