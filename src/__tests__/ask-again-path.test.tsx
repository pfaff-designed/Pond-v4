/**
 * KAN-164 path test — PATH_STEPS end to end on the real composer surface.
 *
 * Ask a question, ask again (the answer is replaced under the same question, no
 * second "you" line, the old one folds to a meta line), open and close the fold,
 * ask again a second time, stop with esc mid-regenerate, fail a regenerate, and
 * reload through the real transcript envelope. Only the model transport is
 * faked: `useChat` is a small stateful stand-in whose `regenerate` drops the
 * current answer exactly as the SDK does, and the Supabase client keeps the one
 * `conversations` row that the real `saveTranscript` / `getOrCreateConversation`
 * write and read.
 */

import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-7',
}))

// The one `conversations` row. `update` stores the envelope as JSON, like the column does.
let mockStoredTranscript: unknown = null
jest.mock('@/lib/supabase/client', () => {
  const chain = () => {
    const q: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'order', 'limit']) q[method] = () => q
    q.maybeSingle = async () => ({
      data: mockStoredTranscript
        ? { id: 'conv-1', transcript: mockStoredTranscript }
        : { id: 'conv-1', transcript: null },
      error: null,
    })
    return q
  }
  return {
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
      },
      from: (table: string) => {
        if (table !== 'conversations') return chain()
        return {
          ...chain(),
          update: (payload: { transcript: unknown }) => {
            mockStoredTranscript = JSON.parse(JSON.stringify(payload.transcript))
            return { eq: async () => ({ error: null }) }
          },
        }
      },
    }),
  }
})

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  collectionTitleResolver: () => () => undefined,
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: jest.fn().mockResolvedValue([]),
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn(),
  markOutdated: jest.fn(),
}))
jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  metadata?: Record<string, unknown>
  parts: Array<{ type: 'text'; text: string }>
}

type ChatController = {
  streamAnswer: (id: string, text: string) => void
  finish: () => void
  fail: () => void
}

const mockChat: { current: ChatController | null } = { current: null }
const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()

jest.mock('@ai-sdk/react', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react')
  return {
    useChat: () => {
      const [messages, setMessages] = useState<ChatMessage[]>([])
      const [status, setStatus] = useState('ready')
      const [error, setError] = useState<Error | undefined>(undefined)

      mockChat.current = {
        // Like the real route: an answer arrives with no metadata of its own.
        streamAnswer: (id, text) => {
          setMessages((prev) => {
            const next: ChatMessage = {
              id,
              role: 'assistant',
              parts: [{ type: 'text', text }],
            }
            const last = prev[prev.length - 1]
            return last?.id === id ? [...prev.slice(0, -1), next] : [...prev, next]
          })
          setStatus('streaming')
        },
        finish: () => setStatus('ready'),
        fail: () => {
          setError(new Error('boom'))
          setStatus('error')
        },
      }

      return {
        messages,
        status,
        error,
        setMessages,
        clearError: () => setError(undefined),
        stop: () => setStatus('ready'),
        addToolOutput: jest.fn(),
        sendMessage: (message: { text: string; metadata?: Record<string, unknown> }) => {
          mockSendMessage(message)
          setMessages((prev) => [
            ...prev,
            {
              id: `u${prev.length}`,
              role: 'user',
              metadata: message.metadata,
              parts: [{ type: 'text', text: message.text }],
            },
          ])
          setStatus('submitted')
        },
        // The SDK drops the current answer the moment a regenerate starts.
        regenerate: async (options: unknown) => {
          mockRegenerate(options)
          setMessages((prev) =>
            prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev
          )
          setError(undefined)
          setStatus('submitted')
        },
      }
    },
  }
})

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'

const renderTerminal = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

const chat = (): ChatController => {
  if (!mockChat.current) throw new Error('the composer has not mounted useChat yet')
  return mockChat.current
}

const waitUntilReady = () => {
  openComposerIfClosed()
  return waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

const youRows = () => document.querySelectorAll('[data-part="you-row"]')
const foldLines = () => screen.queryAllByRole('button', { name: /^earlier answer/ })
const askAgainButtons = () => screen.queryAllByRole('button', { name: 'ask again' })

const foldTime = /^earlier answer · \d{2}:\d{2}$/

const answer = (id: string, text: string) => {
  act(() => chat().streamAnswer(id, text))
}
const settle = () => {
  act(() => chat().finish())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStoredTranscript = null
  mockChat.current = null
})

describe('ask again — the whole path (KAN-164)', () => {
  it('replaces the answer under its question, folds the old one, survives esc, failure and reload', async () => {
    const user = userEvent.setup()
    const { unmount } = renderTerminal()
    await waitUntilReady()

    // 1 — ask a question.
    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'what is on my page?{Enter}'
    )
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    answer('a1', 'first answer')
    settle()
    expect(await screen.findByText('first answer')).toBeInTheDocument()
    expect(youRows()).toHaveLength(1)
    expect(foldLines()).toHaveLength(0)

    // 2 — ask again: regenerate, never a second turn; the old answer folds once the new one lands.
    await user.click(screen.getByRole('button', { name: 'ask again' }))
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    answer('a2', 'second answer')

    // Mid-stream there is nothing to press: ask again is gone, so a double press cannot start a second run.
    expect(askAgainButtons()).toHaveLength(0)
    expect(mockRegenerate).toHaveBeenCalledTimes(1)

    settle()
    expect(await screen.findByText('second answer')).toBeInTheDocument()
    expect(screen.queryByText('first answer')).not.toBeInTheDocument()
    expect(youRows()).toHaveLength(1)
    await waitFor(() => expect(foldLines()).toHaveLength(1))

    // The fold opens in place and closes again.
    const [fold] = foldLines()
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(fold).toHaveTextContent(foldTime)
    await user.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('first answer')).toBeInTheDocument()
    expect(screen.getByText('second answer')).toBeInTheDocument()
    await user.click(fold)
    expect(screen.queryByText('first answer')).not.toBeInTheDocument()

    // 3 — a second ask again appends: two fold lines, the oldest still intact.
    await user.click(screen.getByRole('button', { name: 'ask again' }))
    answer('a3', 'third answer')
    settle()
    expect(await screen.findByText('third answer')).toBeInTheDocument()
    await waitFor(() => expect(foldLines()).toHaveLength(2))
    expect(youRows()).toHaveLength(1)
    const oldest = foldLines()[1]
    expect(oldest).toHaveTextContent(foldTime)
    await user.click(oldest)
    expect(screen.getByText('first answer')).toBeInTheDocument()
    await user.click(oldest)

    // 4 — esc during a regenerate stops it and keeps what arrived.
    await user.click(screen.getByRole('button', { name: 'ask again' }))
    answer('a4', 'a partial thought')
    await user.click(screen.getByRole('textbox', { name: 'Message Pond' }))
    await user.keyboard('{Escape}')
    expect(await screen.findByText('a partial thought')).toBeInTheDocument()
    await waitFor(() => expect(foldLines()).toHaveLength(3))
    expect(youRows()).toHaveLength(1)

    // 5 — a failed regenerate drops its partial and puts the earlier answer back as current.
    await user.click(screen.getByRole('button', { name: 'ask again' }))
    answer('a5', 'half an ans')
    act(() => chat().fail())
    const errorRow = await screen.findByRole('alert')
    expect(await screen.findByText('a partial thought')).toBeInTheDocument()
    expect(screen.queryByText('half an ans')).not.toBeInTheDocument()
    expect(foldLines()).toHaveLength(3)

    // The error row's ask again is live and regenerates the restored answer.
    const regeneratesBefore = mockRegenerate.mock.calls.length
    await user.click(within(errorRow).getByRole('button', { name: 'ask again' }))
    expect(mockRegenerate).toHaveBeenCalledTimes(regeneratesBefore + 1)
    answer('a6', 'the final answer')
    settle()
    expect(await screen.findByText('the final answer')).toBeInTheDocument()
    await waitFor(() => expect(foldLines()).toHaveLength(4))
    expect(youRows()).toHaveLength(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // 6 — reload: the transcript envelope comes back through the real deserializer.
    await waitFor(() => expect(mockStoredTranscript).not.toBeNull())
    const saved = mockStoredTranscript as { messages: ChatMessage[] }
    const current = saved.messages[saved.messages.length - 1]
    expect(current.id).toBe('a6')
    expect(current.metadata?.earlier as unknown[]).toHaveLength(4)

    unmount()
    mockChat.current = null
    renderTerminal()
    await waitUntilReady()

    expect(await screen.findByText('the final answer')).toBeInTheDocument()
    await waitFor(() => expect(foldLines()).toHaveLength(4))
    expect(youRows()).toHaveLength(1)
    const reloadedOldest = foldLines()[3]
    expect(reloadedOldest).toHaveTextContent(foldTime)
    await user.click(reloadedOldest)
    expect(screen.getByText('first answer')).toBeInTheDocument()
  })
})
