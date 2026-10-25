/**
 * The composer's thread is the active pond's, and nothing else's (`s6m5`: "threads
 * … are per pond. Nothing crosses over"). Ponds load async and an unresolved pond
 * reads as the person's first, so the thread waits for the pond to be known, and
 * nothing is sent or saved while another pond's thread is on screen.
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
const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
let mockMessages: UIMessage[] = []
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
    addToolOutput: jest.fn(),
    setMessages: mockSetMessages,
    stop: mockStop,
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { getOrCreateConversation, saveTranscript } from '@/lib/conversation/client'
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

const pondContext = (
  pond: Pond | null,
  loading: boolean,
  ponds: Pond[] = [LIFE, LIFE_2]
): PondContextValue => ({
  pond,
  ponds,
  loading,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
})

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

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
  openComposerIfClosed()
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
  mockMessages = []
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

  it('a `?pond=` the list does not hold loads nothing — never the first pond’s thread', async () => {
    renderIn(pondContext(null, false))
    await act(async () => {})
    expect(getOrCreateConversation).not.toHaveBeenCalled()
    expect(line()).toBeDisabled()
  })

  it('with no ponds at all, the unscoped thread loads', async () => {
    renderIn(pondContext(null, false, []))
    await waitFor(() => expect(pending.has(null)).toBe(true))
    await act(async () => pending.get(null)!({ id: 'conv-none', messages: [], resolutions: {} }))
    await waitFor(() => expect(line()).toBeEnabled())
  })

  it('switching away and back before the other thread lands keeps this pond’s thread', async () => {
    const { rerenderIn } = renderIn(pondContext(LIFE, false))
    await resolveThread(LIFE)
    rerenderIn(pondContext(LIFE_2, false))
    await waitFor(() => expect(pending.has(LIFE_2.id)).toBe(true))

    rerenderIn(pondContext(LIFE, false))
    expect(line()).toBeEnabled()
    await act(async () => pending.get(LIFE_2.id)!(threadOf(LIFE_2)))

    expect(getOrCreateConversation).toHaveBeenCalledTimes(2)
    expect(lastShown()).toBe(`m-${LIFE.id}`)
  })

  it('nothing is saved or sent while another pond’s thread is on screen', async () => {
    mockMessages = [
      turn('q1', 'what is blocking the renovation?'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'the tiler' }] },
    ]
    const { rerenderIn } = renderIn(pondContext(LIFE, false))
    await resolveThread(LIFE)
    await waitFor(() =>
      expect(saveTranscript).toHaveBeenCalledWith(
        expect.anything(),
        `conv-${LIFE.id}`,
        mockMessages,
        expect.anything()
      )
    )
    jest.mocked(saveTranscript).mockClear()

    rerenderIn(pondContext(LIFE_2, false))
    mockMessages = [...mockMessages]
    rerenderIn(pondContext(LIFE_2, false))
    screen.getByRole('button', { name: 'ask again' }).click()

    expect(saveTranscript).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
    // Ask again regenerates the last answer in place, so it is the regenerate that
    // must not fire into the previous pond's thread.
    expect(mockRegenerate).not.toHaveBeenCalled()
  })

  it('ask again regenerates once the active pond’s thread is on screen', async () => {
    mockMessages = [
      turn('q1', 'what is blocking the renovation?'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'the tiler' }] },
    ]
    renderIn(pondContext(LIFE, false))
    await resolveThread(LIFE)
    await waitFor(() => expect(line()).toBeEnabled())

    await act(async () => screen.getByRole('button', { name: 'ask again' }).click())

    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('a switch stops the turn still streaming in the pond it was asked in', async () => {
    const { rerenderIn } = renderIn(pondContext(LIFE, false))
    await resolveThread(LIFE)
    expect(mockStop).not.toHaveBeenCalled()

    rerenderIn(pondContext(LIFE_2, false))
    expect(mockStop).toHaveBeenCalledTimes(1)
  })
})
