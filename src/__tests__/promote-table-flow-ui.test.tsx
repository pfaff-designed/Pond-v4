/**
 * UI flow test for the AI promote_table proposal card (#29).
 *
 * The chat AI proposes converting an existing freeform `table` block into a
 * collection via a client-resolved `tool-promote_table` part; the AITerminal reads
 * the host page's table to preview the inferred columns and renders a
 * PromoteTableProposalCard. Accepting writes through promoteTableFromProposal and
 * settles the card ("Table converted"); rejecting settles it inert ("Dismissed").
 * The promote-table module is only PARTIALLY mocked — the real inferColumnType is
 * kept so the card's column-type preview is exercised end-to-end. Mirrors
 * add-row-flow-ui.test.tsx.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: () => null }),
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

// The Workshop page hosts the freeform table to convert; listPages feeds allPages,
// which drives both the tableHostOptions picker AND the card's inferred-column
// preview (read from the page's blocks). Columns: Item(text) Price(number) Due(date).
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([
    {
      id: 'page-1',
      parentId: null,
      type: 'page',
      title: 'Workshop',
      order: 0,
      props: {},
      blocks: [
        {
          id: 'b-table',
          type: 'table',
          title: 'Shopping',
          columns: ['Item', 'Price', 'Due'],
          rows: [
            { id: 'r1', cells: ['Hammer', '12', '2026-01-04'] },
            { id: 'r2', cells: ['Saw', '30', '2026-02-01'] },
          ],
        },
      ],
    },
  ]),
}))

// The write path — mocked so we can assert it's called and control resolution;
// the rest of the module (inferColumnType) stays real so the preview is genuine.
const mockPromoteTableFromProposal = jest
  .fn()
  .mockResolvedValue({ collectionId: 'page-1', viewBlockId: 'v-1', rowCount: 2 })
jest.mock('@/lib/pages/promote-table', () => ({
  ...jest.requireActual('@/lib/pages/promote-table'),
  promoteTableFromProposal: (...args: unknown[]) => mockPromoteTableFromProposal(...args),
}))

jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  // Called at render for the define_schema card's relation-target preview (#37).
  collectionTitleResolver: () => () => undefined,
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/ai/transports', () => ({
  createMainTransport: () => ({ api: '/api/chat' }),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, schemas: {}, rows: {}, promotions: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

// Mock useChat from @ai-sdk/react — the returned fns must be STABLE across renders
// (the terminal's mount effect depends on setMessages; a fresh fn each render would
// re-fire it and reset the decision maps, masking the card's settle).
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

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function promoteMessage() {
  return [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-promote_table',
          toolCallId: 'pt-1',
          state: 'input-available',
          input: {
            pageId: 'page-1',
            blockId: 'b-table',
            reason: 'Turn this table into a tracked collection.',
          },
        },
      ],
    },
  ]
}

describe('AITerminal — promote_table proposal card', () => {
  beforeEach(() => {
    mockMessages = promoteMessage()
    mockPromoteTableFromProposal.mockClear()
  })

  it('renders a promote_table card with columns + types inferred from the page table', async () => {
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await waitFor(() => expect(screen.getByText('Convert table · 3 columns')).toBeInTheDocument())
    expect(screen.getByText('Shopping')).toBeInTheDocument()
    expect(screen.getByText('Item')).toBeInTheDocument()
    // Types come from the REAL inferColumnType over the mocked table cells.
    expect(screen.getByText('number')).toBeInTheDocument()
    expect(screen.getByText('date')).toBeInTheDocument()
    expect(screen.getByText('2 rows')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Target page' })).toBeInTheDocument()
  })

  it('Accept writes via promoteTableFromProposal and settles the card', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Convert' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Convert' }))

    await waitFor(() => expect(mockPromoteTableFromProposal).toHaveBeenCalledTimes(1))
    const [, proposal] = mockPromoteTableFromProposal.mock.calls[0]
    expect(proposal).toMatchObject({ pageId: 'page-1', blockId: 'b-table' })
    await waitFor(() => expect(screen.getByText('Table converted')).toBeInTheDocument())
  })

  it('Reject settles the card inert without writing', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.getByText('Dismissed')).toBeInTheDocument())
    expect(mockPromoteTableFromProposal).not.toHaveBeenCalled()
  })
})
