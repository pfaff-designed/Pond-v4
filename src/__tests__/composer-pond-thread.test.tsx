/**
 * The composer's thread is the active pond's, and nothing else's (KAN-283, `s6m5`:
 * "threads … are per pond. Nothing crosses over").
 *
 * The switcher is a full page load, and ponds load async: the composer first
 * renders with no pond resolved. An unresolved pond reads as the person's FIRST
 * pond, so a load started then fetched the wrong pond's thread — and if it
 * resolved after the real one, that thread (and its conversation id) stayed under
 * the current pond's context, and every turn was saved into the wrong pond.
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UIMessage } from 'ai'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
}))

type Thread = { id: string; messages: UIMessage[]; resolutions: Record<string, never> }
const pending = new Map<string | null, (thread: Thread) => void>()
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(
    (_supabase: unknown, _user: string, pondId: string | null) =>
      new Promise<Thread>((resolve) => pending.set(pondId, resolve))
  ),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockSetMessages = jest.fn()
const mockStop = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: mockSetMessages,
    stop: mockStop,
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { getOrCreateConversation } from '@/lib/conversation/client'
import type { Pond } from '@/lib/pond/client'

const LIFE = { id: 'pond-life', name: 'life' } as Pond
const LIFE_2 = { id: 'pond-life-2', name: 'Life 2' } as Pond

const turn = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
})
const threadOf = (pond: Pond): Thread => ({
  id: `conv-${pond.id}`,
  messages: [turn(`m-${pond.id}`, `asked in ${pond.name}`)],
  resolutions: {},
})

const pondContext = (pond: Pond | null, loading: boolean): PondContextValue => ({
  pond,
  ponds: [LIFE, LIFE_2],
  loading,
  reload: () => {},
  addPond: () => {},
})

const queryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderIn = (value: PondContextValue) => {
  const client = queryClient()
  const view = (v: PondContextValue) => (
    <QueryClientProvider client={client}>
      <PondContext.Provider value={v}>
        <AITerminal />
      </PondContext.Provider>
    </QueryClientProvider>
  )
  const utils = render(view(value))
  return { rerenderIn: (v: PondContextValue) => utils.rerender(view(v)) }
}

const line = () => screen.getByRole('textbox', { name: 'Message Pond' })
const resolveThread = async (pond: Pond) => {
  await waitFor(() => expect(pending.has(pond.id)).toBe(true))
  await act(async () => pending.get(pond.id)!(threadOf(pond)))
}
const lastShown = () => (mockSetMessages.mock.calls.at(-1)?.[0] as UIMessage[] | undefined)?.[0]?.id

beforeEach(() => {
  jest.clearAllMocks()
  pending.clear()
  window.localStorage.clear()
})

describe('the composer thread follows the active pond', () => {
  it('loads no thread while the pond list is still loading — an unresolved pond is not the first pond', async () => {
    const { rerenderIn } = renderIn(pondContext(null, true))
    await act(async () => {})
    expect(getOrCreateConversation).not.toHaveBeenCalled()
    expect(line()).toBeDisabled()

    rerenderIn(pondContext(LIFE_2, false))
    await resolveThread(LIFE_2)

    expect(getOrCreateConversation).toHaveBeenCalledTimes(1)
    expect(jest.mocked(getOrCreateConversation).mock.calls[0][2]).toBe(LIFE_2.id)
    expect(lastShown()).toBe(`m-${LIFE_2.id}`)
    await waitFor(() => expect(line()).toBeEnabled())
  })

  it('a pond’s thread that resolves after a later switch never lands', async () => {
    const { rerenderIn } = renderIn(pondContext(LIFE, false))
    await waitFor(() => expect(pending.has(LIFE.id)).toBe(true))

    rerenderIn(pondContext(LIFE_2, false))
    await resolveThread(LIFE_2)
    await act(async () => pending.get(LIFE.id)!(threadOf(LIFE)))

    expect(lastShown()).toBe(`m-${LIFE_2.id}`)
    expect(mockSetMessages).not.toHaveBeenCalledWith(threadOf(LIFE).messages)
  })

  it('the line is off mid-switch, until the new pond’s thread is on screen', async () => {
    const { rerenderIn } = renderIn(pondContext(LIFE, false))
    await resolveThread(LIFE)
    await waitFor(() => expect(line()).toBeEnabled())

    rerenderIn(pondContext(LIFE_2, false))
    expect(line()).toBeDisabled()

    await resolveThread(LIFE_2)
    await waitFor(() => expect(line()).toBeEnabled())
  })

  it('a switch stops the turn still streaming in the pond it was asked in', async () => {
    const { rerenderIn } = renderIn(pondContext(LIFE, false))
    await resolveThread(LIFE)
    expect(mockStop).not.toHaveBeenCalled()

    rerenderIn(pondContext(LIFE_2, false))
    expect(mockStop).toHaveBeenCalledTimes(1)
  })
})
