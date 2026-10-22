/**
 * KAN-302 — `contextLabel` names the open page for a new answer's "read" chip
 * and for a same-page proposal card with no explicit target. Both must follow
 * the page's LIVE title, not `nodeName` — the breadcrumb's URL param, frozen
 * at whatever it read at navigation time and never updated by a rename.
 * Mocks mirror `change-preview-freeze.test.tsx`.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let mockNodeName = 'Untitled'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  // The person renamed the page after navigating here — `nodeName` still
  // reads the pre-rename title; only the page query (`currentPage`) is live.
  useSearchParams: () => ({
    get: (key: string) =>
      ({ nodeId: 'page-1', nodeName: mockNodeName, nodeType: 'page' })[key] ?? null,
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
// Empty on purpose: the live title must come off the PAGE QUERY (`currentPage`),
// not a lookup through `allPages` — so this proves the fallback chain's first
// rung rather than the one item 2 already fixed.
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
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: mockResolutions,
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: jest.fn().mockResolvedValue([]),
  resolveChainStatuses: jest.fn().mockResolvedValue(new Map()),
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn().mockResolvedValue(undefined),
  markOutdated: jest.fn(),
}))

jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
  useSessionUndo: () => ({ canUndo: false }),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

let mockMessages: Array<{
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}> = []

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: jest.fn(),
    regenerate: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
    error: undefined,
  })),
}))

global.fetch = jest
  .fn()
  .mockResolvedValue({ ok: true, json: async () => ({ extractions: [] }) } as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function pageDoc(title: string) {
  return {
    id: PAGE_ID,
    parentId: null,
    type: 'page',
    title,
    blocks: [{ id: 'b1', type: 'text', content: 'Hello world' }],
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
  openComposerIfClosed()
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeName = 'Untitled'
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockGetPage.mockResolvedValue(pageDoc('Plans'))
  mockListPages.mockResolvedValue([])
  mockMessages = [
    {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'done' }, editBatch('pc1')],
    },
  ]
})

describe('KAN-302 — contextLabel follows the live page title, not the stale nodeName param', () => {
  it("a new answer's read chip and a same-page card both read the renamed title, never the stale one", async () => {
    renderWithQuery(<AITerminal />)
    await ready()

    await waitFor(() => expect(screen.getByTestId('read-chips')).toBeInTheDocument())
    expect(within(screen.getByTestId('read-chips')).getByText('Plans')).toBeInTheDocument()
    expect(within(screen.getByTestId('read-chips')).queryByText('Untitled')).not.toBeInTheDocument()

    const card = screen.getByRole('group', { name: /proposed edit/ })
    await waitFor(() => expect(within(card).getByText(/— Plans/)).toBeInTheDocument())
    expect(within(card).queryByText(/— Untitled/)).not.toBeInTheDocument()
  })

  it('an empty-titled open page still yields a read chip, labelled Untitled, never the pond name', async () => {
    // The rail's `+` navigates here with an empty `nodeName` too — if the live
    // title's own fallback to 'Untitled' were skipped, the chain would fall
    // through to `nodeName || pondName`, and since usePondName() is never
    // empty, the chip would misname the POND as the source instead.
    mockNodeName = ''
    mockGetPage.mockResolvedValue(pageDoc(''))
    renderWithQuery(<AITerminal />)
    await ready()

    await waitFor(() => expect(screen.getByTestId('read-chips')).toBeInTheDocument())
    expect(within(screen.getByTestId('read-chips')).getByText('Untitled')).toBeInTheDocument()
    expect(within(screen.getByTestId('read-chips')).queryByText('life')).not.toBeInTheDocument()
  })
})
