/**
 * KAN-315 path test — PATH_STEPS end to end on the real composer surface.
 *
 * Loads a persisted thread whose transcript already carries the production
 * shape (two assistant answers sharing one id, from the pre-fix overlapping
 * `regenerate()` race) through the REAL `getOrCreateConversation` /
 * `deserializeTranscript` load path — only the Supabase client and the model
 * transport are faked. Then asks a fresh question and asks again once more,
 * asserting no "Encountered two children with the same key" console error at
 * any point.
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
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

// The persisted row, in the production shape: an overlapping-`regenerate()` race
// left TWO assistant messages under the same question sharing one id (`dupe`) —
// they sit as siblings in one turn, which is exactly where React's per-`.map()`
// key check sees them side by side and warns.
const seededTranscript = {
  messages: [
    {
      id: 'u1',
      role: 'user',
      metadata: { sentAt: '2026-10-14T10:00:00.000Z' },
      parts: [{ type: 'text', text: 'what is on my page?' }],
    },
    {
      id: 'dupe',
      role: 'assistant',
      parts: [{ type: 'text', text: 'first answer' }],
    },
    {
      id: 'dupe',
      role: 'assistant',
      parts: [{ type: 'text', text: 'second answer' }],
    },
  ],
}

jest.mock('@/lib/supabase/client', () => {
  const chain = () => {
    const q: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'order', 'limit']) q[method] = () => q
    q.maybeSingle = async () => ({
      data: { id: 'conv-1', transcript: seededTranscript },
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
        return { ...chain(), update: () => ({ eq: async () => ({ error: null }) }) }
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

      mockChat.current = {
        streamAnswer: (id, text) => {
          setMessages((prev) => {
            const next: ChatMessage = { id, role: 'assistant', parts: [{ type: 'text', text }] }
            const last = prev[prev.length - 1]
            return last?.id === id ? [...prev.slice(0, -1), next] : [...prev, next]
          })
          setStatus('streaming')
        },
        finish: () => setStatus('ready'),
      }

      return {
        messages,
        status,
        error: undefined,
        setMessages,
        clearError: jest.fn(),
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
        regenerate: async (options: unknown) => {
          mockRegenerate(options)
          setMessages((prev) =>
            prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev
          )
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

const answer = (id: string, text: string) => {
  act(() => chat().streamAnswer(id, text))
}
const settle = () => {
  act(() => chat().finish())
}

const duplicateKeyError = /Encountered two children with the same key/

beforeEach(() => {
  jest.clearAllMocks()
  mockChat.current = null
})

describe('duplicate message ids never log a duplicate-key error (KAN-315)', () => {
  it('loads a persisted thread with a repeated id, then asks fresh and asks again, with no console error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    // 1/2 — the persisted thread (two answers sharing one id, under the same
    // question) renders both answers, each once, with no duplicate-key error.
    expect(await screen.findByText('first answer')).toBeInTheDocument()
    expect(screen.getByText('second answer')).toBeInTheDocument()
    expect(errorSpy.mock.calls.some(([arg]) => duplicateKeyError.test(String(arg)))).toBe(false)

    // 3 — a fresh question gets its own fresh-id answer.
    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'and the third page?{Enter}'
    )
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    answer('a-fresh', 'third answer')
    settle()
    expect(await screen.findByText('third answer')).toBeInTheDocument()
    expect(errorSpy.mock.calls.some(([arg]) => duplicateKeyError.test(String(arg)))).toBe(false)

    // 4 — ask again once more.
    await user.click(screen.getByRole('button', { name: 'ask again' }))
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    answer('a-regenerated', 'fourth answer')
    settle()
    expect(await screen.findByText('fourth answer')).toBeInTheDocument()
    expect(screen.queryByText('third answer')).not.toBeInTheDocument()
    expect(errorSpy.mock.calls.some(([arg]) => duplicateKeyError.test(String(arg)))).toBe(false)

    errorSpy.mockRestore()
  })
})
