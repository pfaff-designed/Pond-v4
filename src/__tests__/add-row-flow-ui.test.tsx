/**
 * UI flow test for the AI add_row proposal card (#18).
 *
 * The chat AI proposes a new row for an EXISTING collection via a client-resolved
 * `tool-add_row` part; the AITerminal renders an AddRowProposalCard. Accepting
 * writes through addRowFromProposal and settles the card ("Row added"); rejecting
 * settles it inert ("Dismissed"). Integration-style RTL test with Jest mocks for
 * Supabase, @ai-sdk/react, next/navigation, and the write path. Mirrors
 * define-schema-flow-ui.test.tsx.
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

// The reading-list collection is the row's target; listPages feeds the picker.
// It carries a _schema so isCollection is true and it appears in collectionOptions.
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([
    {
      id: 'coll-reading',
      parentId: null,
      type: 'page',
      title: 'Reading List',
      props: { _schema: [{ id: 'p-author', name: 'Author', type: 'text' }] },
    },
  ]),
}))

// The write path — mocked so we can assert it's called and control resolution.
const mockAddRowFromProposal = jest.fn().mockResolvedValue({ id: 'row-1' })
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: (...args: unknown[]) => mockAddRowFromProposal(...args),
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
    resolutions: { changes: {}, creates: {}, schemas: {}, rows: {}, skipped: {} },
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

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function rowMessage() {
  return [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-add_row',
          toolCallId: 'ar-1',
          state: 'input-available',
          input: {
            collectionId: 'coll-reading',
            title: 'Dune',
            reason: 'A new entry for the reading list.',
            props: { Author: 'Frank Herbert' },
          },
        },
      ],
    },
  ]
}

describe('AITerminal — add_row proposal card', () => {
  beforeEach(() => {
    mockMessages = rowMessage()
    mockAddRowFromProposal.mockClear()
  })

  it('renders an add_row card for a tool-add_row message part', async () => {
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    expect(screen.getByText('New row · 1 field')).toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add row' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Target collection' })).toBeInTheDocument()
  })

  it('Accept writes via addRowFromProposal and settles the card', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add row' }))

    await waitFor(() => {
      expect(mockAddRowFromProposal).toHaveBeenCalledTimes(1)
    })
    const [, proposal] = mockAddRowFromProposal.mock.calls[0]
    expect(proposal).toMatchObject({
      collectionId: 'coll-reading',
      title: 'Dune',
      props: { Author: 'Frank Herbert' },
    })
    await waitFor(() => expect(screen.getByText('Row added')).toBeInTheDocument())
  })

  it('Reject settles the card inert without writing', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.getByText('Dismissed')).toBeInTheDocument())
    expect(mockAddRowFromProposal).not.toHaveBeenCalled()
  })
})
