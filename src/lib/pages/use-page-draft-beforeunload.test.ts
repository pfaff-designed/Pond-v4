/**
 * `beforeunload` (KAN-407): registered whenever there is unsaved work —
 * pending debounce, in flight, offline-pending, or retrying — and removed
 * once the draft lands (`saved`).
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { resetPageWriteRegistry } from '@/lib/pages/page-flush'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
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
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('../../__tests__/helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

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

const PAGE_2: PondPage = {
  id: 'page-2',
  parentId: null,
  type: 'page',
  title: 'Second',
  blocks: [textBlock('World')],
  props: {},
  order: 1,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }
}

function mountDraft(initialPage: PondPage = PAGE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, rerender } = renderHook(
    (page: PondPage) => {
      const getSupabase = useLazySupabase()
      return usePageDraft({ page, pageId: page.id, pondId: 'pond-1', getSupabase })
    },
    { wrapper: wrapper(client), initialProps: initialPage }
  )
  return { result, rerender }
}

function dispatchBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  window.dispatchEvent(event)
  return event
}

function dispatchPageHide() {
  window.dispatchEvent(new Event('pagehide'))
}

function dispatchVisibilityHidden() {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  resetPageWriteRegistry()
  jest.useFakeTimers()
  mockUpdateTitle.mockReset()
  mockCommitBlocks.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('usePageDraft beforeunload (KAN-407)', () => {
  it('is registered while a save is pending (debounce) and cancels the event', () => {
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    expect(result.current.saved).toBe(false)

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
    // jsdom's `Event.returnValue` is boolean (default `true`); setting it to
    // `''` per the handler still flips it away from that default, which is
    // the observable part of the contract in this environment.
    expect(event.returnValue).not.toBe(true)
  })

  it('is removed once the save lands', async () => {
    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.saved).toBe(true)

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
  })

  it('stays registered while a save is in flight', async () => {
    let resolveUpdateTitle: () => void = () => {}
    mockUpdateTitle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdateTitle = resolve
        })
    )
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
    })
    expect(result.current.saved).toBe(false)

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)

    await act(async () => {
      resolveUpdateTitle()
      await Promise.resolve()
      await Promise.resolve()
    })
  })

  it('stays registered while a failed save is retrying', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('network down'))
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.retrying).toBe(true)
    expect(result.current.saved).toBe(false)

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
  })

  it('stays registered while offline with a pending edit', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    const { result } = mountDraft()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
    })
    expect(result.current.offline).toBe(true)
    expect(result.current.saved).toBe(false)

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  })

  it('stays registered for a left page whose retry is still pending, and clears once that retry lands', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('network down'))
    const { result, rerender } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.retrying).toBe(true)

    // Open page-2: the seed effect sets `saved` back to true for the newly
    // opened page even though page-1's retry is still outstanding.
    rerender(PAGE_2)
    expect(result.current.saved).toBe(true)

    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)

    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    await act(async () => {
      jest.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()
    })

    const landedEvent = dispatchBeforeUnload()
    expect(landedEvent.defaultPrevented).toBe(false)
  })
})

describe('usePageDraft pagehide/visibilitychange flush (KAN-407)', () => {
  it('pagehide flushes a pending debounced save at once', async () => {
    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    expect(result.current.saved).toBe(false)

    await act(async () => {
      dispatchPageHide()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(result.current.saved).toBe(true)
  })

  it('visibilitychange (hidden) flushes a pending debounced save at once', async () => {
    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    expect(result.current.saved).toBe(false)

    await act(async () => {
      dispatchVisibilityHidden()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(result.current.saved).toBe(true)
  })

  it('while offline, visibilitychange (hidden) does not hit the network and keeps the draft pending; online then flushes it', async () => {
    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    const { result } = mountDraft()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      result.current.commitLocalEdit([textBlock('typed while offline')])
    })

    await act(async () => {
      dispatchVisibilityHidden()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).not.toHaveBeenCalled()
    expect(result.current.saved).toBe(false)

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'page-1',
      [textBlock('typed while offline')],
      expect.anything()
    )
    expect(result.current.saved).toBe(true)
  })
})
