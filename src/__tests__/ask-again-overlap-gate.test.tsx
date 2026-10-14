/**
 * KAN-315 — the overlapping-`handleAskAgain` race.
 *
 * A pending `flushPendingPageSave` (KAN-302) defers `regenerate()` until the
 * flush resolves, so `isStreaming` never flips between a click and that
 * resolution. A second click in that window must not queue a second
 * `regenerate()` on the same answer — two overlapping `regenerate()` calls
 * collide on the SDK's shared `state.messages` and repeat an id
 * (`chat-regenerate-id-reuse.test.ts` reproduces that collision directly
 * through the real `@ai-sdk/react` `Chat` class).
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-7',
}))

jest.mock('@/lib/supabase/client', () => {
  const chain = () => {
    const q: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'order', 'limit']) q[method] = () => q
    q.maybeSingle = async () => ({ data: { id: 'conv-1', transcript: null }, error: null })
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

type ChatController = { streamAnswer: (id: string, text: string) => void; finish: () => void }

const mockChat: { current: ChatController | null } = { current: null }
const mockRegenerate = jest.fn()
const mockSendMessage = jest.fn()

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
        sendMessage: (message: { text: string }) => {
          mockSendMessage(message)
          setMessages((prev) => [
            ...prev,
            { id: `u${prev.length}`, role: 'user', parts: [{ type: 'text', text: message.text }] },
          ])
          setStatus('submitted')
        },
        // The race lives upstream of here (in `handleAskAgain`'s dispatch), so the
        // mock only needs to record how many times `regenerate` is actually called.
        regenerate: async (options: unknown) => {
          mockRegenerate(options)
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
import { registerPageFlush } from '@/lib/pages/page-flush'

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

const waitUntilReady = () =>
  waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())

beforeEach(() => {
  jest.clearAllMocks()
  mockChat.current = null
})

describe('handleAskAgain overlap gate (KAN-315)', () => {
  it('a second click while flushPendingPageSave is still pending never queues a second regenerate()', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    // No page flush is registered for this first send, so it stays in this
    // tick — isolates the shared gate's state to the two ask-again clicks
    // below, rather than also coupling it to the original send's own flush.
    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'what is on my page?{Enter}'
    )
    act(() => chat().streamAnswer('a1', 'first answer'))
    act(() => chat().finish())
    expect(await screen.findByText('first answer')).toBeInTheDocument()

    let resolveFlush: () => void = () => {}
    const pendingFlush = new Promise<void>((resolve) => {
      resolveFlush = resolve
    })
    // Mirrors `flushNow` returning the SAME in-flight promise to every caller
    // while a save is still in the air — the idempotence that lets two
    // `handleAskAgain` clicks land on one `.then(dispatchRegenerate)` queue each.
    const unregister = registerPageFlush('page-1', () => pendingFlush)

    try {
      const askAgain = screen.getByRole('button', { name: 'ask again' })
      await user.click(askAgain)
      await user.click(askAgain)

      // Neither click's regenerate() has fired yet: the flush is still pending.
      expect(mockRegenerate).not.toHaveBeenCalled()

      await act(async () => {
        resolveFlush()
        await pendingFlush
      })

      await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    } finally {
      unregister()
    }
  })

  it('a flush that rejects still lets a later ask again regenerate', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    // No page flush is registered for this first send, so it stays in this tick —
    // only the ask-again below exercises the rejecting flush.
    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'what is on my page?{Enter}'
    )
    act(() => chat().streamAnswer('a1', 'first answer'))
    act(() => chat().finish())
    expect(await screen.findByText('first answer')).toBeInTheDocument()

    let rejectFlush: (err: Error) => void = () => {}
    const pendingFlush = new Promise<void>((_resolve, reject) => {
      rejectFlush = reject
    })
    const unregister = registerPageFlush('page-1', () => pendingFlush)

    try {
      const askAgain = screen.getByRole('button', { name: 'ask again' })
      await user.click(askAgain)

      expect(mockRegenerate).not.toHaveBeenCalled()

      await act(async () => {
        rejectFlush(new Error('save failed'))
        await pendingFlush.catch(() => {})
      })

      // No answer came back from that failed flush, so regenerate() never ran —
      // but the gate must have reopened rather than latching closed.
      expect(mockRegenerate).not.toHaveBeenCalled()

      // A later ask again, with nothing pending this time, must still go through.
      unregister()
      await user.click(askAgain)
      await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
    } finally {
      unregister()
    }
  })
})

describe('shared dispatch gate — sendText and handleAskAgain (KAN-315)', () => {
  it('send + send during one pending flush dispatches exactly one request', async () => {
    let resolveFlush: () => void = () => {}
    const pendingFlush = new Promise<void>((resolve) => {
      resolveFlush = resolve
    })
    const unregister = registerPageFlush('page-1', () => pendingFlush)

    try {
      const user = userEvent.setup()
      renderTerminal()
      await waitUntilReady()

      const textbox = screen.getByRole('textbox', { name: 'Message Pond' })
      await user.type(textbox, 'first question{Enter}')
      // The first send's own flush is still pending — isStreaming has not
      // flipped, so a second send in this window is what the gate must block.
      expect(mockSendMessage).not.toHaveBeenCalled()
      await user.type(textbox, 'second question{Enter}')
      expect(mockSendMessage).not.toHaveBeenCalled()

      await act(async () => {
        resolveFlush()
        await pendingFlush
      })

      await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'first question' })
      )
    } finally {
      unregister()
    }
  })

  it('ask-again + send during one pending flush dispatches exactly one request', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await waitUntilReady()

    // No page flush is registered for this first send, so it stays in this tick.
    await user.type(
      screen.getByRole('textbox', { name: 'Message Pond' }),
      'what is on my page?{Enter}'
    )
    act(() => chat().streamAnswer('a1', 'first answer'))
    act(() => chat().finish())
    expect(await screen.findByText('first answer')).toBeInTheDocument()
    mockSendMessage.mockClear()

    let resolveFlush: () => void = () => {}
    const pendingFlush = new Promise<void>((resolve) => {
      resolveFlush = resolve
    })
    const unregister = registerPageFlush('page-1', () => pendingFlush)

    try {
      const askAgain = screen.getByRole('button', { name: 'ask again' })
      await user.click(askAgain)
      expect(mockRegenerate).not.toHaveBeenCalled()

      // A send that lands while the ask-again's flush is still pending must be
      // blocked by the SAME gate — otherwise both requests dispatch on the one
      // `Chat` instance and their streamed writes interleave two ids (KAN-315).
      await user.type(
        screen.getByRole('textbox', { name: 'Message Pond' }),
        'a follow-up question{Enter}'
      )
      expect(mockSendMessage).not.toHaveBeenCalled()

      await act(async () => {
        resolveFlush()
        await pendingFlush
      })

      await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1))
      expect(mockSendMessage).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })
})
