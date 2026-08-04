/**
 * UI tests for NodeCreationModal and its wiring points.
 *
 * Tests:
 * 1. Modal opens when the + button is clicked in Sidebar
 * 2. Modal closes on Cancel
 * 3. Modal closes after successful Create
 * 4. /save command in AITerminal opens the modal
 * 5. React Query ['areas'] cache is invalidated after successful create
 *
 * These are integration-style RTL tests using Jest mocks for Supabase,
 * @ai-sdk/react, and next/navigation.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
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
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'new-node-id' }, error: null }),
      update: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))

jest.mock('@/lib/ai/transports', () => ({
  createNodeChatTransport: () => ({ api: '/api/node-chat' }),
  createMainTransport: () => ({ api: '/api/chat' }),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1', messages: [] }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

// Mock createNode separately so tests can control what it does
const mockCreateNode = jest.fn().mockResolvedValue({ id: 'new-node-id' })
jest.mock('@/lib/nodes/create', () => ({
  createNode: (...args: unknown[]) => mockCreateNode(...args),
  parseActionCard: jest.fn((json: string) => {
    try {
      const parsed = JSON.parse(json)
      if (!parsed.type || !parsed.name) return null
      return parsed
    } catch {
      return null
    }
  }),
}))

// Mock useChat from @ai-sdk/react
const mockSendMessage = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  parts: Array<{ type: string; text: string }>
}> = []
let mockStatus = 'ready'

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    setMessages: jest.fn(),
    status: mockStatus,
  })),
}))

// ── Import components after mocks ─────────────────────────────────────────

import { Sidebar } from '@/components/organisms/Sidebar'
import { AITerminal } from '@/components/organisms/AITerminal'
import { NodeCreationModal } from '@/components/organisms/NodeCreationModal'

// ── Test helpers ──────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function renderWithQuery(ui: React.ReactElement, queryClient = makeQueryClient()) {
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  }
}

// ── NodeCreationModal standalone tests ────────────────────────────────────

describe('NodeCreationModal', () => {
  beforeEach(() => {
    mockMessages = []
    mockStatus = 'ready'
    mockCreateNode.mockResolvedValue({ id: 'new-node-id' })
  })

  it('renders as open when isOpen=true', () => {
    renderWithQuery(<NodeCreationModal isOpen={true} onClose={jest.fn()} onCreated={jest.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render dialog content when isOpen=false', () => {
    renderWithQuery(<NodeCreationModal isOpen={false} onClose={jest.fn()} onCreated={jest.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = jest.fn()
    renderWithQuery(<NodeCreationModal isOpen={true} onClose={onClose} onCreated={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows an action card when AI proposes an entity JSON', () => {
    // Simulate messages that include the AI proposing an entity
    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'I suggest creating:\n```json\n{"type":"area","name":"Travel"}\n```',
          },
        ],
      },
    ]

    renderWithQuery(<NodeCreationModal isOpen={true} onClose={jest.fn()} onCreated={jest.fn()} />)

    // The action card should be visible with the proposed entity
    expect(screen.getByText(/travel/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('calls createNode and onCreated then closes when Create is confirmed', async () => {
    const onClose = jest.fn()
    const onCreated = jest.fn()

    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Here is my proposal:\n```json\n{"type":"area","name":"Travel"}\n```',
          },
        ],
      },
    ]

    renderWithQuery(<NodeCreationModal isOpen={true} onClose={onClose} onCreated={onCreated} />)

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(mockCreateNode).toHaveBeenCalled()
      expect(onCreated).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('invalidates the [areas] query cache after creation', async () => {
    const queryClient = makeQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    mockMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: '```json\n{"type":"area","name":"Travel"}\n```',
          },
        ],
      },
    ]

    renderWithQuery(
      <NodeCreationModal isOpen={true} onClose={jest.fn()} onCreated={jest.fn()} />,
      queryClient
    )

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['areas'] }))
    })
  })
})

// ── Sidebar wiring ────────────────────────────────────────────────────────

describe('Sidebar — + button opens NodeCreationModal', () => {
  it('opens the NodeCreationModal when + is clicked', async () => {
    renderWithQuery(<Sidebar />)

    const plusButton = screen.getByRole('button', { name: /new node/i })
    fireEvent.click(plusButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('closes the modal after clicking Cancel inside it', async () => {
    renderWithQuery(<Sidebar />)

    fireEvent.click(screen.getByRole('button', { name: /new node/i }))
    await waitFor(() => screen.getByRole('dialog'))

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

// ── AITerminal /save command wiring ───────────────────────────────────────

describe('AITerminal — /save command opens NodeCreationModal', () => {
  beforeEach(() => {
    mockMessages = []
    mockStatus = 'ready'
  })

  it('opens the NodeCreationModal when /save is submitted', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)

    // Wait for terminal to be ready
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/talk to pond/i)
    await user.type(textarea, '/save')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
