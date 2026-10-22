/**
 * UI flow test for the AI configure_view proposal card (#19 slice 5).
 *
 * The chat AI proposes a layout for an EXISTING collection via a client-resolved
 * `tool-configure_view` part; the AITerminal renders a ConfigureViewProposalCard.
 * Accepting writes through configureViewFromProposal and settles the card ("View
 * configured"); rejecting settles it inert ("Dismissed"). Integration-style RTL test
 * with Jest mocks for Supabase, @ai-sdk/react, next/navigation, and the write path.
 * Mirrors add-row-flow-ui.test.tsx.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

const mockRouterPush = jest.fn()
// The currently-open page id (nodeId). Null by default (inline-view tests); a linked
// view (#41) is placed on this host, so the linked test sets it before rendering.
let mockNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: (k: string) => (k === 'nodeId' ? mockNodeId : null) }),
}))

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

// The Tasks collection is the view's target; listPages feeds the picker. It carries
// a _schema so isCollection is true and it appears in collectionOptions.
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([
    {
      id: 'coll-tasks',
      parentId: null,
      type: 'page',
      title: 'Tasks',
      props: {
        _schema: [
          {
            id: 'p-status',
            name: 'Status',
            type: 'status',
            options: [{ id: 'o-todo', label: 'To do' }],
          },
        ],
      },
    },
  ]),
}))

jest.mock('@/lib/pages/create-page', () => ({
  // Keep the pure exports real (configure-view's resolveCollectionByName delegates to
  // collectionNameResolver here); stub only the write paths.
  ...jest.requireActual('@/lib/pages/create-page'),
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
}))

// The write path — mocked so we can assert it's called and control resolution.
// #52 — the write path now returns { id, replaced }; the default write mints a fresh
// view (replaced=false). A per-test override exercises the switch case.
const mockConfigureViewFromProposal = jest
  .fn()
  .mockResolvedValue({ id: 'coll-tasks', replaced: false })
jest.mock('@/lib/pages/configure-view', () => ({
  // Keep the pure resolveCollectionByName real (it drives the linked-view picker
  // pre-selection); only the write path is mocked so we can assert its args.
  ...jest.requireActual('@/lib/pages/configure-view'),
  configureViewFromProposal: (...args: unknown[]) => mockConfigureViewFromProposal(...args),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, schemas: {}, rows: {}, views: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

// Mock useChat from @ai-sdk/react (for AITerminal). The returned functions must be
// STABLE references across renders — the terminal's mount effect depends on
// setMessages, so a fresh jest.fn() each render would re-fire it and reset the
// decision maps on every render (masking the card's settle).
const mockSendMessage = jest.fn()
const mockSetMessages = jest.fn()
const mockAddToolOutput = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  parts: Array<Record<string, unknown>>
}> = []
const mockStatus = 'ready'

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    addToolOutput: mockAddToolOutput,
    setMessages: mockSetMessages,
    status: mockStatus,
  })),
}))

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

// ── Import component after mocks ──────────────────────────────────────────

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function viewMessage() {
  return [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-configure_view',
          toolCallId: 'cv-1',
          state: 'input-available',
          input: {
            pageId: 'coll-tasks',
            mode: 'board',
            groupBy: 'Status',
            reason: 'A board grouped by status.',
          },
        },
      ],
    },
  ]
}

// A LINKED view (#41): the model names ANOTHER collection ("Tasks") to draw on the
// currently-open page. targetCollection triggers the linked accept path.
function linkedViewMessage() {
  return [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-configure_view',
          toolCallId: 'cv-1',
          state: 'input-available',
          input: {
            pageId: 'home-dashboard',
            mode: 'board',
            groupBy: 'Status',
            targetCollection: 'Tasks',
            reason: 'Your tasks, here.',
          },
        },
      ],
    },
  ]
}

describe('AITerminal — configure_view proposal card', () => {
  beforeEach(() => {
    mockMessages = viewMessage()
    mockNodeId = null
    mockConfigureViewFromProposal.mockClear()
  })

  it('renders a configure_view card for a tool-configure_view message part', async () => {
    renderWithQuery(<AITerminal />)
    openComposerIfClosed()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())

    expect(screen.getByText('New view · Board')).toBeInTheDocument()
    expect(screen.getByText('Grouped by')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply view' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Target collection' })).toBeInTheDocument()
  })

  it('Accept writes via configureViewFromProposal and settles the card', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    openComposerIfClosed()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Apply view' }))

    await waitFor(() => {
      expect(mockConfigureViewFromProposal).toHaveBeenCalledTimes(1)
    })
    const [, proposal] = mockConfigureViewFromProposal.mock.calls[0]
    expect(proposal).toMatchObject({
      pageId: 'coll-tasks',
      mode: 'board',
      groupBy: 'Status',
    })
    await waitFor(() => expect(screen.getByText('View configured')).toBeInTheDocument())
  })

  it('a linked view (targetCollection) draws another collection on the open page', async () => {
    const user = userEvent.setup()
    mockMessages = linkedViewMessage()
    mockNodeId = 'home-dashboard' // the currently-open host page
    renderWithQuery(<AITerminal />)
    openComposerIfClosed()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())

    // The picker is relabelled for a linked view and pre-selects the named target.
    expect(screen.getByText('Draw rows from')).toBeInTheDocument()
    const picker = screen.getByRole('combobox', {
      name: 'Target collection',
    }) as HTMLSelectElement
    expect(picker.value).toBe('coll-tasks')

    await user.click(screen.getByRole('button', { name: 'Apply view' }))

    await waitFor(() => expect(mockConfigureViewFromProposal).toHaveBeenCalledTimes(1))
    const [, proposal] = mockConfigureViewFromProposal.mock.calls[0]
    // The view lives on the OPEN page (host) but points at the named collection.
    expect(proposal).toMatchObject({
      pageId: 'home-dashboard',
      collectionId: 'coll-tasks',
      mode: 'board',
      groupBy: 'Status',
    })
    await waitFor(() => expect(screen.getByText('View configured')).toBeInTheDocument())
  })

  it('Reject settles the card inert without writing', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    openComposerIfClosed()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.getByText('Dismissed')).toBeInTheDocument())
    expect(mockConfigureViewFromProposal).not.toHaveBeenCalled()
  })
})
