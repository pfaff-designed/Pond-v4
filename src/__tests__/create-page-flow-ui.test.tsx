/**
 * UI tests for the manual page-creation flow (ticket-26) and its neighbours.
 *
 * Tests:
 * 1. The palette's `new page` action (⌘K → ShellCommands) opens the
 *    CreatePageModal (no instant dead-end create).
 * 2. CreatePageModal creates a `page` (never an `area`) under the chosen parent
 *    and navigates into the editor.
 * 3. The destination defaults to the current context (?nodeId) with an override.
 * 4. AITerminal create_page proposal card + /save picker (unchanged neighbours).
 *
 * Integration-style RTL tests using Jest mocks for Supabase, @ai-sdk/react, and
 * next/navigation.
 */

import React from 'react'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

const mockRouterPush = jest.fn()
let mockNodeId: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
}))

// createPage is called by CreatePageModal; spy on it directly.
const mockCreatePage = jest.fn().mockResolvedValue({ id: 'new-page-id', type: 'page', title: '' })

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
      single: jest.fn().mockResolvedValue({ data: { id: 'new-page-id' }, error: null }),
      update: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: (...args: unknown[]) => mockCreatePage(...args),
}))

// The pages tree read used by the destination picker — empty is fine.
// insertPageOptimistic (F26) is called on create before navigation; stub it so
// the real setQueryData path doesn't run under the mocked query client.
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
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

// createNode is still used by SavePickerModal (opened via /save).
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

// Mock useChat from @ai-sdk/react (for AITerminal)
const mockSendMessage = jest.fn()
const mockAddToolOutput = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  parts: Array<{ type: string; text: string }>
}> = []
let mockStatus = 'ready'
let capturedOnToolCall:
  | ((opts: { toolCall: { toolCallId: string; toolName: string; input: unknown } }) => void)
  | undefined

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn((opts?: { onToolCall?: unknown }) => {
    capturedOnToolCall = opts?.onToolCall as typeof capturedOnToolCall
    return {
      messages: mockMessages,
      sendMessage: mockSendMessage,
      addToolOutput: mockAddToolOutput,
      setMessages: jest.fn(),
      status: mockStatus,
    }
  }),
}))

// Stub fetch for SavePickerModal (returns empty extractions)
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

// ── Import components after mocks ─────────────────────────────────────────

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { requestTerminalFocus } from '@/lib/terminal-focus'
import { fetchPages } from '@/lib/pages/tree'
import { AITerminal } from '@/components/organisms/AITerminal'

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

/** ⌘K, `>` for actions, then the bare `new page` action — the path that opens the creation dialog. */
async function openNewPageFromPalette() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: '>' } })
  fireEvent.click(await screen.findByRole('option', { name: /new page(?! “)/ }))
}

// ── the palette's `new page` action opens the creation modal ─────────────

describe('ShellCommands — the palette’s `new page` action opens the New page modal', () => {
  beforeEach(() => {
    mockRouterPush.mockClear()
    mockCreatePage.mockClear().mockResolvedValue({ id: 'new-page-id', type: 'page', title: '' })
    mockNodeId = null
  })

  it('opens the New page dialog instead of instant-creating', async () => {
    renderWithQuery(<ShellCommands />)

    // No dialog at rest, and no page created yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockCreatePage).not.toHaveBeenCalled()

    await openNewPageFromPalette()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(screen.getByRole('textbox', { name: /page title/i })).toBeInTheDocument()
    // Still nothing created — the modal is the gate now.
    expect(mockCreatePage).not.toHaveBeenCalled()
  })

  it('creates a page (not an area) at top level and lands in the editor', async () => {
    const user = userEvent.setup()
    renderWithQuery(<ShellCommands />)

    await openNewPageFromPalette()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.type(screen.getByRole('textbox', { name: /page title/i }), 'Marathon Plan')
    fireEvent.click(screen.getByRole('button', { name: /create page/i }))

    await waitFor(() => {
      expect(mockCreatePage).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ type: 'page', parentId: null, title: 'Marathon Plan' })
      )
    })
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        expect.stringContaining('nodeType=page&nodeId=new-page-id')
      )
    })
  })

  it('defaults the destination to the current page (?nodeId)', async () => {
    mockNodeId = 'health-area'
    const user = userEvent.setup()
    renderWithQuery(<ShellCommands />)

    await openNewPageFromPalette()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.type(screen.getByRole('textbox', { name: /page title/i }), 'Sleep Log')
    fireEvent.click(screen.getByRole('button', { name: /create page/i }))

    await waitFor(() => {
      expect(mockCreatePage).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ type: 'page', parentId: 'health-area', title: 'Sleep Log' })
      )
    })
  })

  it("writes 'Untitled' (never an empty title) when created without a name", async () => {
    renderWithQuery(<ShellCommands />)

    await openNewPageFromPalette()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // Submit with the title field untouched.
    fireEvent.click(screen.getByRole('button', { name: /create page/i }))

    await waitFor(() => {
      expect(mockCreatePage).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ title: 'Untitled' })
      )
    })
  })
})

// ── ⌘K `new page “q”` — the parent it names is the parent it uses (#279) ──

describe('ShellCommands — the palette’s `new page “q” under <parent>` files under that parent', () => {
  const pages = [
    { id: 'health', parent_id: null, type: 'area', title: 'Health', order: 0, updated_at: '' },
    {
      id: 'sleep',
      parent_id: 'health',
      type: 'page',
      title: 'Sleep log',
      order: 0,
      updated_at: '',
    },
  ]
  beforeEach(() => {
    mockCreatePage.mockClear().mockResolvedValue({ id: 'new-page-id', type: 'page', title: '' })
    ;(fetchPages as jest.Mock).mockResolvedValue(pages)
  })
  afterEach(() => {
    ;(fetchPages as jest.Mock).mockResolvedValue([])
    mockNodeId = null
  })

  it('on a leaf page (no scope), the row names the leaf and the dialog creates under it', async () => {
    mockNodeId = 'sleep'
    const user = userEvent.setup()
    renderWithQuery(<ShellCommands />)

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    // A leaf has no children, so the palette opens unscoped — the #239 shape
    // was "under life" here while the dialog filed under the leaf.
    expect(document.querySelector('[data-part="scope"]')).toBeNull()
    await user.type(input, 'zzz')

    const make = await screen.findByRole('option', { name: /^> ?new page “zzz” under / })
    const named = make.textContent!.match(/under (.+?)↵?$/)![1]
    const namedPage = pages.find((p) => p.title === named)!
    expect(namedPage.id).toBe('sleep')

    fireEvent.click(make)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: /page title/i })).toHaveValue('zzz')
    fireEvent.click(screen.getByRole('button', { name: /create page/i }))

    await waitFor(() => {
      expect(mockCreatePage).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ title: 'zzz', parentId: namedPage.id })
      )
    })
  })
})

// ── AITerminal — create_page contract (M1) ────────────────────────────────
// The chat AI no longer emits create_node: the terminal wires NO onToolCall
// handler and instead renders a create_page proposal card for a
// tool-create_page message part.

describe('AITerminal — create_page contract', () => {
  beforeEach(() => {
    mockMessages = []
    mockStatus = 'ready'
    capturedOnToolCall = undefined
    mockAddToolOutput.mockClear()
    mockRouterPush.mockClear()
  })

  it('registers no onToolCall handler (create_node is gone from the chat path)', async () => {
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    expect(capturedOnToolCall).toBeUndefined()
    // No create_node dialog is ever opened from the terminal.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a create_page proposal card for a tool-create_page message part', async () => {
    mockMessages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-create_page',
            toolCallId: 'tc-1',
            state: 'input-available',
            input: {
              type: 'page',
              kind: 'recipe',
              title: 'Lasagna',
              parentTitle: null,
              blocks: [{ type: 'text', content: '# Lasagna' }],
            },
          } as unknown as { type: string; text: string },
        ],
      },
    ]
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())

    expect(screen.getByText('Lasagna')).toBeInTheDocument()
    expect(screen.getByText(/new page · recipe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create page/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /destination/i })).toBeInTheDocument()
  })
})

// ── AITerminal — ⌘K `ask pond about “q”` never clobbers a draft (#279) ────

describe('AITerminal — the palette’s question lands in an empty composer only', () => {
  beforeEach(() => {
    mockMessages = []
    mockStatus = 'ready'
  })

  it('prefills an empty composer, and leaves a draft in progress alone', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    const textarea = screen.getByPlaceholderText(/ask pond, or \/ for blocks/i)

    act(() => requestTerminalFocus('ask pond about “cabinets”'))
    await waitFor(() => expect(textarea).toHaveValue('ask pond about “cabinets”'))

    await user.clear(textarea)
    await user.type(textarea, 'half a thought')
    act(() => requestTerminalFocus('ask pond about “sleep”'))
    expect(textarea).toHaveValue('half a thought')
    expect(textarea).toHaveFocus()
  })
})

// ── AITerminal /save command opens picker ────────────────────────────────

describe('AITerminal — /save command opens picker', () => {
  beforeEach(() => {
    mockMessages = []
    mockStatus = 'ready'
  })

  it('opens SavePickerModal when /save is submitted', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/ask pond, or \/ for blocks/i)
    await user.type(textarea, '/save')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /save as/i })).toBeInTheDocument()
    })
  })
})
