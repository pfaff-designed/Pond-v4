/**
 * `flushNow` (KAN-302): the composer must never send while a page save is
 * still landing. Covers `page-flush.ts`'s registry and `usePageDraft`'s own
 * flush across the three states a flush can find a save in: pending in the
 * debounce, already in flight (the debounce timer fired but the network
 * round-trip hasn't landed), or settled.
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { registerPageFlush, flushPendingPageSave } from '@/lib/pages/page-flush'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const mockUpdateTitle = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

const textBlock = (content: string): Block => ({ id: 'b1', type: 'text', content }) as Block

const PAGE: PondPage = {
  id: 'page-1',
  parentId: null,
  type: 'page',
  title: 'Untitled',
  blocks: [textBlock('Hello')],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function mountDraft() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(
    () => {
      const getSupabase = useLazySupabase()
      return usePageDraft({ page: PAGE, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
    },
    { wrapper: wrapper(client) }
  )
  return { result }
}

function deferred<T = void>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// What the real `commitBlocks` resolves to for an own-edit save (`remembered`
// settles once the record is on `sessionUndo`'s stack) — settled by default so
// tests that don't care about that timing see `runSave` resolve as before.
const committedNow = () => ({ remembered: Promise.resolve() })

beforeEach(() => {
  jest.useFakeTimers()
  mockUpdateTitle.mockReset()
  mockCommitBlocks.mockReset()
  mockUpdateTitle.mockResolvedValue(undefined)
  mockCommitBlocks.mockResolvedValue(committedNow())
})

afterEach(() => {
  jest.useRealTimers()
})

describe('usePageDraft flushNow (KAN-302)', () => {
  it('an edit pending in the debounce: flush runs the save and resolves after it', async () => {
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('Hello moon')])
    })

    const flush = flushPendingPageSave(PAGE.id)
    expect(flush).toBeDefined()
    // The save hasn't landed yet at the instant flush was called.
    expect(mockCommitBlocks).not.toHaveBeenCalled()

    await act(async () => {
      await flush
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    expect(result.current.saved).toBe(true)
  })

  it('a save already in flight: flush returns that SAME promise, not a second save', async () => {
    const inFlight = deferred()
    mockUpdateTitle.mockReturnValueOnce(inFlight.promise)
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('Hello moon')])
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
    })
    // The debounce fired on its own: the save is now awaiting updateTitle.
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)

    const first = flushPendingPageSave(PAGE.id)
    const second = flushPendingPageSave(PAGE.id)
    expect(first).toBeDefined()
    expect(first).toBe(second)
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1) // flush started no second save

    inFlight.resolve()
    await act(async () => {
      await first
    })
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
  })

  it('nothing pending or in flight: flush resolves at once', () => {
    mountDraft()

    expect(flushPendingPageSave(PAGE.id)).toBeUndefined()
    expect(mockUpdateTitle).not.toHaveBeenCalled()
  })

  it('a second save flushed while the first is still in flight waits for it, and lands last (KAN-355)', async () => {
    const first = deferred<{ remembered: Promise<void> }>()
    const second = deferred<{ remembered: Promise<void> }>()
    mockCommitBlocks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('A')])
    })
    const flushA = flushPendingPageSave(PAGE.id)
    // Let A's `updateTitle` await settle so its `commitBlocks` call has happened.
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.commitLocalEdit([textBlock('B')])
    })
    const flushB = flushPendingPageSave(PAGE.id)
    // Give B's own `updateTitle` await a chance to settle too, if it started.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // B must not start its own round-trip while A's is still unresolved.
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)

    first.resolve(committedNow())
    second.resolve(committedNow())
    // Awaiting B's own promise only resolves once B's chained `runSave` has
    // actually run, which (per the fix) only happens after A's has settled —
    // so by the time this resolves, both have landed, in order.
    await act(async () => {
      await flushB
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(2)
    expect(mockCommitBlocks.mock.calls[1][3]).toEqual([textBlock('B')])
    expect(result.current.saved).toBe(true)
    await flushA
  })

  it("a flush waits for the save's record to be remembered, not just for the write to land (KAN-355)", async () => {
    const remember = deferred<void>()
    mockCommitBlocks.mockResolvedValueOnce({ remembered: remember.promise })
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('Hello moon')])
    })
    const flush = flushPendingPageSave(PAGE.id)
    expect(flush).toBeDefined()

    let settled = false
    void flush?.then(() => {
      settled = true
    })
    // The write and the page's own "saved" state land...
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.saved).toBe(true)
    // ...but the flush itself must not resolve until the record is remembered,
    // or a ⌘Z that awaits it could still race the session undo stack.
    expect(settled).toBe(false)

    remember.resolve()
    await act(async () => {
      await flush
    })
    expect(settled).toBe(true)
  })
})

describe('page-flush registry', () => {
  it('flushing an id nobody registered is a no-op', () => {
    expect(flushPendingPageSave('no-such-page')).toBeUndefined()
    expect(flushPendingPageSave(null)).toBeUndefined()
    expect(flushPendingPageSave(undefined)).toBeUndefined()
  })

  it('a flush stops firing once its registration is cleaned up', () => {
    const flush = jest.fn(() => undefined)
    const unregister = registerPageFlush('p-reg', flush)

    flushPendingPageSave('p-reg')
    expect(flush).toHaveBeenCalledTimes(1)

    unregister()
    flushPendingPageSave('p-reg')
    expect(flush).toHaveBeenCalledTimes(1)
  })
})
