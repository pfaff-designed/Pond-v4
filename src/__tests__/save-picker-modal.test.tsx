/**
 * Tests for the /save command and SavePickerModal.
 *
 * Tests:
 * 1. Typing /save in AITerminal opens the SavePickerModal
 * 2. Modal calls /api/save-extract with current messages
 * 3. Modal shows loading state while fetching
 * 4. Modal renders extracted items (project + actions)
 * 5. Confirming an item calls createNode and shows success
 * 6. Rejecting an item removes it from the list without writing
 * 7. After all items are resolved, modal can be closed
 * 8. onClose callback is called when modal is dismissed
 * 9. If extraction returns empty, modal shows empty state
 * 10. Multiple items can be confirmed independently
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks ──────────────────────────────────────────────────────────

const mockRouterPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
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
      single: jest.fn().mockResolvedValue({ data: { id: 'saved-node-id' }, error: null }),
      update: jest.fn().mockReturnThis(),
    }),
  }),
}))

jest.mock('@/lib/ai/transports', () => ({
  createMainTransport: () => ({ api: '/api/chat' }),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockCreateNode = jest.fn().mockResolvedValue({ id: 'saved-node-id' })
jest.mock('@/lib/nodes/create', () => ({
  createNode: (...args: unknown[]) => mockCreateNode(...args),
  parseActionCard: jest.fn(),
}))

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

// Control fetch responses for save-extract
let mockFetchResponse: {
  extractions: Array<{ id: string; type: string; name: string }>
} = { extractions: [] }
let mockFetchDelay = 0

global.fetch = jest.fn().mockImplementation(async (url: string) => {
  if (url === '/api/save-extract') {
    if (mockFetchDelay > 0) {
      await new Promise((r) => setTimeout(r, mockFetchDelay))
    }
    return {
      ok: true,
      json: async () => mockFetchResponse,
    } as Response
  }
  return { ok: false, json: async () => ({}) } as Response
})

// ── Imports ───────────────────────────────────────────────────────────────

import { AITerminal } from '@/components/organisms/AITerminal'
import { SavePickerModal } from '@/components/organisms/SavePickerModal'

// ── Helpers ───────────────────────────────────────────────────────────────

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchResponse = { extractions: [] }
  mockFetchDelay = 0
})

// ─── SavePickerModal unit tests ───────────────────────────────────────────

describe('SavePickerModal', () => {
  it('is not rendered when isOpen is false', () => {
    wrap(<SavePickerModal isOpen={false} messages={[]} onClose={jest.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with a loading state when open', async () => {
    mockFetchDelay = 500
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/extracting/i)).toBeInTheDocument()
  })

  it('calls /api/save-extract with messages on open', async () => {
    const messages = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }]
    wrap(<SavePickerModal isOpen={true} messages={messages as never} onClose={jest.fn()} />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/save-extract',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ messages }),
        })
      )
    })
  })

  it('renders extracted items after fetch resolves', async () => {
    mockFetchResponse = {
      extractions: [
        { id: 'e1', type: 'project', name: 'Website Redesign' },
        { id: 'e2', type: 'action', name: 'Send invoice' },
      ],
    }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
      expect(screen.getByText('Send invoice')).toBeInTheDocument()
    })
  })

  it('shows empty state when extraction returns nothing', async () => {
    mockFetchResponse = { extractions: [] }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/nothing to save/i)).toBeInTheDocument()
    })
  })

  it('labels each extraction with its type', async () => {
    mockFetchResponse = {
      extractions: [
        { id: 'e1', type: 'project', name: 'Big Project' },
        { id: 'e2', type: 'action', name: 'Small Task' },
      ],
    }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => {
      // type labels rendered as uppercase spans
      const typeLabels = document.querySelectorAll('.uppercase')
      const labelTexts = Array.from(typeLabels).map((el) => el.textContent?.toLowerCase())
      expect(labelTexts).toContain('project')
      expect(labelTexts).toContain('action')
    })
  })

  it('calls createNode with correct card when Save is clicked', async () => {
    mockFetchResponse = {
      extractions: [{ id: 'e1', type: 'area', name: 'Travel' }],
    }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => screen.getByText('Travel'))

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockCreateNode).toHaveBeenCalledWith(expect.anything(), {
        type: 'area',
        name: 'Travel',
      })
    })
  })

  it('removes item from list when Skip is clicked (no createNode call)', async () => {
    mockFetchResponse = {
      extractions: [{ id: 'e1', type: 'action', name: 'Send invoice' }],
    }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => screen.getByText('Send invoice'))

    fireEvent.click(screen.getByRole('button', { name: /skip/i }))

    await waitFor(() => {
      expect(screen.queryByText('Send invoice')).not.toBeInTheDocument()
    })
    expect(mockCreateNode).not.toHaveBeenCalled()
  })

  it('shows saved state after successful createNode', async () => {
    mockFetchResponse = {
      extractions: [{ id: 'e1', type: 'project', name: 'My Project' }],
    }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => screen.getByText('My Project'))

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when Done button is clicked', async () => {
    mockFetchResponse = { extractions: [] }
    const onClose = jest.fn()
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={onClose} />)
    await waitFor(() => screen.getByText(/nothing to save/i))

    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when close (✕) button is clicked', async () => {
    mockFetchResponse = { extractions: [] }
    const onClose = jest.fn()
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={onClose} />)
    await waitFor(() => screen.getByText(/nothing to save/i))

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('can save multiple items independently', async () => {
    mockFetchResponse = {
      extractions: [
        { id: 'e1', type: 'area', name: 'Area A' },
        { id: 'e2', type: 'action', name: 'Action B' },
      ],
    }
    wrap(<SavePickerModal isOpen={true} messages={[]} onClose={jest.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Area A')).toBeInTheDocument()
      expect(screen.getByText('Action B')).toBeInTheDocument()
    })

    const saveButtons = screen.getAllByRole('button', { name: /save/i })
    fireEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(mockCreateNode).toHaveBeenCalledTimes(1)
      expect(mockCreateNode).toHaveBeenCalledWith(expect.anything(), {
        type: 'area',
        name: 'Area A',
      })
    })
    // Action B still visible
    expect(screen.getByText('Action B')).toBeInTheDocument()
  })
})

// ─── AITerminal /save integration ────────────────────────────────────────

describe('AITerminal /save command', () => {
  it('opens SavePickerModal when /save is typed and Enter pressed', async () => {
    mockFetchResponse = { extractions: [] }
    wrap(<AITerminal />)

    await waitFor(() => screen.getByPlaceholderText(/talk to pond/i))

    const textarea = screen.getByPlaceholderText(/talk to pond/i)
    fireEvent.change(textarea, { target: { value: '/save' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/save as/i)).toBeInTheDocument()
    })
  })

  it('passes current messages to SavePickerModal', async () => {
    mockFetchResponse = { extractions: [] }
    wrap(<AITerminal />)

    await waitFor(() => screen.getByPlaceholderText(/talk to pond/i))

    const textarea = screen.getByPlaceholderText(/talk to pond/i)
    fireEvent.change(textarea, { target: { value: '/save' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => screen.getByRole('dialog'))

    // Verify fetch was called (modal mounted and triggered extraction)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/save-extract', expect.anything())
    })
  })

  it('closes SavePickerModal when onClose fires', async () => {
    mockFetchResponse = { extractions: [] }
    wrap(<AITerminal />)

    await waitFor(() => screen.getByPlaceholderText(/talk to pond/i))

    const textarea = screen.getByPlaceholderText(/talk to pond/i)
    fireEvent.change(textarea, { target: { value: '/save' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => screen.getByRole('dialog'))
    await waitFor(() => screen.getByText(/nothing to save/i))

    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
