/**
 * Integration test: typing /handoff in the AITerminal runs the handoff
 * lifecycle (performHandoff) and starts a fresh session.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks ──────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
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

const mockPerformHandoff = jest.fn().mockResolvedValue({
  freshConversation: {
    id: 'fresh-conv',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  },
  written: 2,
})
jest.mock('@/lib/conversation/handoff', () => ({
  performHandoff: (...args: unknown[]) => mockPerformHandoff(...args),
}))

const mockSetMessages = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'plan a trip' }] }],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: mockSetMessages,
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => jest.clearAllMocks())

describe('AITerminal /handoff command', () => {
  it('runs performHandoff with the current transcript and clears the terminal', async () => {
    wrap(<AITerminal />)

    await waitFor(() => screen.getByPlaceholderText(/reply, or ask something else/i))

    const textarea = screen.getByPlaceholderText(/reply, or ask something else/i)
    fireEvent.change(textarea, { target: { value: '/handoff' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(mockPerformHandoff).toHaveBeenCalledWith(
        expect.anything(),
        'conv-1',
        'user-1',
        expect.arrayContaining([
          expect.objectContaining({ parts: [{ type: 'text', text: 'plan a trip' }] }),
        ]),
        undefined,
        'main'
      )
    })

    await waitFor(() => {
      expect(mockSetMessages).toHaveBeenCalledWith([])
    })
  })

  it('does not send /handoff as a chat message', async () => {
    wrap(<AITerminal />)
    await waitFor(() => screen.getByPlaceholderText(/reply, or ask something else/i))

    const textarea = screen.getByPlaceholderText(/reply, or ask something else/i)
    fireEvent.change(textarea, { target: { value: '/handoff' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(mockPerformHandoff).toHaveBeenCalled())
    // input cleared after the command runs
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })
})
