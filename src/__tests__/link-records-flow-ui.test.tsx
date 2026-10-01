/**
 * UI flow test for the AI link_records proposal card (#40).
 *
 * The chat AI proposes linking EXISTING rows via a client-resolved
 * `tool-link_records` part; the AITerminal renders a LinkRecordsProposalCard.
 * Accepting writes through linkRecordsFromProposal and settles the card
 * ("Linked"); rejecting settles it inert ("Dismissed"); a resolution failure
 * (no such row / duplicate title) surfaces its message ON the card and reverts
 * to pending so the user can retry — a dangling id is never written. Mirrors
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

// The Trip Packing collection: the tool names it by TITLE ("Trip Packing"),
// which the terminal pre-resolves against this list for the picker; it carries a
// _schema so it appears in collectionOptions.
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([
    {
      id: 'coll-trip',
      parentId: null,
      type: 'page',
      title: 'Trip Packing',
      props: {
        _schema: [{ id: 'p-packs', name: 'Packs With', type: 'relation', target: 'coll-trip' }],
      },
    },
  ]),
}))

// The write path — mocked so we can assert it's called and control resolution.
const mockLinkRecordsFromProposal = jest.fn()
jest.mock('@/lib/pages/link-records', () => ({
  ...jest.requireActual('@/lib/pages/link-records'),
  linkRecordsFromProposal: (...args: unknown[]) => mockLinkRecordsFromProposal(...args),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, schemas: {}, rows: {}, links: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

// Mock useChat from @ai-sdk/react (for AITerminal). Stable references across
// renders — see add-row-flow-ui.test.tsx for why.
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

function linkMessage(toRows: string[] = ['Tent']) {
  return [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-link_records',
          toolCallId: 'lr-1',
          state: 'input-available',
          input: {
            fromRow: 'Stove',
            fromCollection: 'Trip Packing',
            relation: 'Packs With',
            toRows,
            reason: 'These pack together.',
          },
        },
      ],
    },
  ]
}

describe('AITerminal — link_records proposal card', () => {
  beforeEach(() => {
    mockMessages = linkMessage()
    mockLinkRecordsFromProposal.mockReset()
    mockLinkRecordsFromProposal.mockResolvedValue({
      sourceRowId: 'row-stove',
      propertyId: 'p-packs',
      targetCollectionId: 'coll-trip',
      value: ['row-tent'],
    })
  })

  it('renders a link_records card for a tool-link_records message part', async () => {
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    expect(screen.getByText(/Link records/)).toBeInTheDocument()
    expect(screen.getByText('Stove')).toBeInTheDocument()
    expect(screen.getByText('Packs With')).toBeInTheDocument()
    expect(screen.getByText('Tent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Source collection' })).toBeInTheDocument()
  })

  it('Accept writes via linkRecordsFromProposal (pre-resolved collection) and settles the card', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() => {
      expect(mockLinkRecordsFromProposal).toHaveBeenCalledTimes(1)
    })
    const [, proposal] = mockLinkRecordsFromProposal.mock.calls[0]
    expect(proposal).toEqual({
      collectionId: 'coll-trip', // "Trip Packing" resolved by name against the pages list
      fromRow: 'Stove',
      relation: 'Packs With',
      toRows: ['Tent'],
    })
    await waitFor(() => expect(screen.getByText('Linked')).toBeInTheDocument())
  })

  it('Reject settles the card inert without writing', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.getByText('Dismissed')).toBeInTheDocument())
    expect(mockLinkRecordsFromProposal).not.toHaveBeenCalled()
  })

  it('a resolution failure surfaces its message on the card and reverts to pending', async () => {
    mockLinkRecordsFromProposal.mockRejectedValueOnce(
      new Error('No row titled "Lantern" in that collection')
    )
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Link' }))

    // The clear "no such row" message lands on the card; the card re-arms so the
    // user can retry — and nothing dangling was written (the write path threw
    // before any write).
    await waitFor(() => expect(screen.getByText(/No row titled "Lantern"/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
  })
})
