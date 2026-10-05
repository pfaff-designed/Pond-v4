/**
 * AITerminal chat command slash menu — unit tests.
 *
 * Covers: typing '/' shows the command menu, selecting /clear calls handleClear,
 * selecting /handoff calls handleHandoff, selecting /save opens the save picker,
 * and the menu closes when input is cleared/changed away from '/'.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AITerminal } from '@/components/organisms/AITerminal'

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'nodeId') return 'page-1'
      if (key === 'nodeName') return 'My Page'
      if (key === 'nodeType') return 'page'
      return null
    },
  }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}))

const mockGetOrCreateConversation = jest.fn().mockResolvedValue({
  id: 'conv-1',
  messages: [],
  resolutions: { changes: {}, creates: {}, skipped: {}, targets: {} },
})
const mockSaveTranscript = jest.fn().mockResolvedValue(undefined)
const mockDissolveConversation = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: (...args: unknown[]) => mockGetOrCreateConversation(...args),
  saveTranscript: (...args: unknown[]) => mockSaveTranscript(...args),
  dissolveConversation: (...args: unknown[]) => mockDissolveConversation(...args),
}))

const mockPerformHandoff = jest.fn().mockResolvedValue({
  freshConversation: { id: 'conv-2', messages: [], resolutions: {} },
  written: 0,
})
jest.mock('@/lib/conversation/handoff', () => ({
  performHandoff: (...args: unknown[]) => mockPerformHandoff(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/pages/parent-options', () => ({
  toParentOptions: () => [],
}))

jest.mock('@/lib/pages/accept', () => ({
  writeAcceptedChanges: jest.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedReasons: [] }),
}))

jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  // Called at render for the define_schema card's relation-target preview (#37).
  collectionTitleResolver: () => () => undefined,
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

// Minimal useChat mock
jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  }),
}))

// TerminalDrawer just renders its children + footer
jest.mock('@/components/molecules/TerminalDrawer', () => ({
  TerminalDrawer: ({
    children,
    footer,
  }: {
    children: React.ReactNode
    footer: React.ReactNode
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}))

// Provide a minimal SavePickerModal mock that the real import path resolves
jest.mock('@/components/organisms/SavePickerModal', () => ({
  SavePickerModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="save-picker-modal" /> : null,
}))

function renderTerminal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AITerminal />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetOrCreateConversation.mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {}, targets: {} },
  })
})

describe('Chat command slash menu', () => {
  it('shows the command menu when "/" is typed', async () => {
    renderTerminal()
    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    fireEvent.change(textarea, { target: { value: '/' } })
    expect(await screen.findByRole('listbox', { name: 'commands' })).toBeInTheDocument()
    expect(screen.getByText('/clear')).toBeInTheDocument()
    expect(screen.getByText('/handoff')).toBeInTheDocument()
    expect(screen.getByText('/save')).toBeInTheDocument()
  })

  it('closes the menu when input is cleared', async () => {
    renderTerminal()
    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    fireEvent.change(textarea, { target: { value: '/' } })
    expect(await screen.findByRole('listbox', { name: 'commands' })).toBeInTheDocument()
    fireEvent.change(textarea, { target: { value: '' } })
    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'commands' })).not.toBeInTheDocument()
    })
  })

  it('does not show menu for regular text input', async () => {
    renderTerminal()
    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(screen.queryByRole('listbox', { name: 'commands' })).not.toBeInTheDocument()
  })

  it('selecting /clear calls dissolveConversation and resets', async () => {
    mockDissolveConversation.mockResolvedValue(undefined)
    mockGetOrCreateConversation
      .mockResolvedValueOnce({
        id: 'conv-1',
        messages: [],
        resolutions: { changes: {}, creates: {}, skipped: {}, targets: {} },
      })
      .mockResolvedValue({
        id: 'conv-2',
        messages: [],
        resolutions: { changes: {}, creates: {}, skipped: {}, targets: {} },
      })

    renderTerminal()
    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    fireEvent.change(textarea, { target: { value: '/' } })
    const clearButton = await screen.findByText('/clear')
    fireEvent.click(clearButton)

    await waitFor(() => expect(mockDissolveConversation).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('selecting /save opens the save picker modal', async () => {
    renderTerminal()
    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    fireEvent.change(textarea, { target: { value: '/' } })
    const saveButton = await screen.findByText('/save')
    fireEvent.click(saveButton)
    expect(await screen.findByTestId('save-picker-modal')).toBeInTheDocument()
  })

  it('selecting /handoff calls performHandoff', async () => {
    renderTerminal()
    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    fireEvent.change(textarea, { target: { value: '/' } })
    const handoffButton = await screen.findByText('/handoff')
    fireEvent.click(handoffButton)
    await waitFor(() => expect(mockPerformHandoff).toHaveBeenCalled(), { timeout: 3000 })
  })
})
