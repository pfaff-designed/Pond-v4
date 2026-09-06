/**
 * UI flow test for the AI define_schema proposal card (#17 slice 5).
 *
 * The chat AI proposes a property schema for an EXISTING page via a client-resolved
 * `tool-define_schema` part; the AITerminal renders a DefineSchemaProposalCard.
 * Accepting writes through defineSchemaFromProposal and settles the card ("Schema
 * defined"); rejecting settles it inert ("Dismissed"). Integration-style RTL test
 * with Jest mocks for Supabase, @ai-sdk/react, next/navigation, and the write path.
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

// The reading-list page is the schema's target; listPages feeds the picker. The
// Trips COLLECTION (it carries a `_schema`) is the resolvable relation target for
// the card's target-collection preview (#37).
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([
    { id: 'page-reading', parentId: null, type: 'page', title: 'Reading List' },
    {
      id: 'col-trips',
      parentId: null,
      type: 'page',
      title: 'Trips',
      props: { _schema: [{ id: 't-where', name: 'Where', type: 'text' }] },
    },
  ]),
}))

// The write path — mocked so we can assert it's called and control resolution.
// The pure title resolver stays REAL so the card's relation-target preview (#37)
// resolves against the mocked listPages above.
const mockDefineSchemaFromProposal = jest
  .fn()
  .mockResolvedValue([{ id: 's-1', name: 'Status', type: 'status' }])
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: (...args: unknown[]) => mockDefineSchemaFromProposal(...args),
  collectionNameResolver: () => () => undefined,
  collectionPropertyResolver: () => () => undefined,
  collectionTitleResolver: (
    jest.requireActual('@/lib/pages/create-page') as {
      collectionTitleResolver: (pages: unknown[]) => (name: string) => string | undefined
    }
  ).collectionTitleResolver,
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
    resolutions: { changes: {}, creates: {}, schemas: {}, skipped: {} },
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

function schemaMessage() {
  return [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-define_schema',
          toolCallId: 'ds-1',
          state: 'input-available',
          input: {
            pageId: 'page-reading',
            reason: 'Track each book as it moves through the list.',
            properties: [
              { name: 'Author', type: 'text' },
              { name: 'Status', type: 'status', options: [{ label: 'Reading' }] },
            ],
          },
        },
      ],
    },
  ]
}

describe('AITerminal — define_schema proposal card', () => {
  beforeEach(() => {
    mockMessages = schemaMessage()
    mockDefineSchemaFromProposal.mockClear()
  })

  it('renders a define_schema card for a tool-define_schema message part', async () => {
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    expect(screen.getByText('New schema · 2 properties')).toBeInTheDocument()
    expect(screen.getByText('Author')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Define schema' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Target page' })).toBeInTheDocument()
  })

  it('Accept writes via defineSchemaFromProposal and settles the card', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Define schema' }))

    await waitFor(() => {
      expect(mockDefineSchemaFromProposal).toHaveBeenCalledTimes(1)
    })
    const [, proposal] = mockDefineSchemaFromProposal.mock.calls[0]
    expect(proposal).toMatchObject({
      pageId: 'page-reading',
      schema: [
        { name: 'Author', type: 'text' },
        { name: 'Status', type: 'status' },
      ],
    })
    await waitFor(() => expect(screen.getByText('Schema defined')).toBeInTheDocument())
  })

  it('previews a relation property’s resolved target collection, flagging a no-match (#37)', async () => {
    mockMessages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-define_schema',
            toolCallId: 'ds-2',
            state: 'input-available',
            input: {
              pageId: 'page-reading',
              properties: [
                // Proposed lowercase — the preview shows the CANONICAL resolved title.
                { name: 'Trip', type: 'relation', target: 'trips' },
                // No collection named this exists — flagged so the user can correct it.
                { name: 'Companion', type: 'relation', target: 'People' },
                // Untargeted relation (link any page) — no target preview at all.
                { name: 'Anything', type: 'relation' },
              ],
            },
          },
        ],
      },
    ]
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    // Resolved: the Trips collection (from the pages cache) is previewed by title.
    await waitFor(() => expect(screen.getByText('→ Trips')).toBeInTheDocument())
    // Unresolved: the proposed name is flagged so the user can correct before accept.
    expect(screen.getByText('→ People · no match')).toBeInTheDocument()
    // Untargeted: nothing beyond the `relation` type chip.
    expect(screen.queryByText(/^→ Anything/)).not.toBeInTheDocument()
  })

  it('Reject settles the card inert without writing', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.getByText('Dismissed')).toBeInTheDocument())
    expect(mockDefineSchemaFromProposal).not.toHaveBeenCalled()
  })
})
