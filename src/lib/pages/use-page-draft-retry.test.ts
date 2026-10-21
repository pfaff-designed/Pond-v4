/**
 * Retry (KAN-407): a save that fails while online schedules a retry via
 * `save-retry.ts`'s backoff instead of silently returning. A later edit
 * retries that failed save first, then writes the later draft, so neither
 * step is dropped and the page ends on what the person has now.
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

const PAGE_B: PondPage = { ...PAGE, id: 'page-2', title: 'Other' }

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

beforeEach(() => {
  resetPageWriteRegistry()
  jest.useFakeTimers()
  mockUpdateTitle.mockReset()
  mockCommitBlocks.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('usePageDraft retry (KAN-407)', () => {
  it('a failed save while online schedules a retry and exposes retrying', async () => {
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

    expect(result.current.saved).toBe(false)
    expect(result.current.retrying).toBe(true)
  })

  it('the retry lands after backoff, clearing retrying and setting saved', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('network down'))
    mockUpdateTitle.mockResolvedValueOnce(undefined)
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
    expect(result.current.retrying).toBe(true)

    await act(async () => {
      jest.advanceTimersByTime(2000) // first backoff step
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(result.current.retrying).toBe(false)
    expect(result.current.saved).toBe(true)
    expect(result.current.savedAt).not.toBeNull()
  })

  it('a later edit retries the failed save, then writes the later draft', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('first fails'))
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
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(result.current.retrying).toBe(true)

    act(() => {
      result.current.commitLocalEdit([textBlock('v2')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(3)
    expect(mockCommitBlocks).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE.id,
      [textBlock('v2')],
      expect.anything()
    )
    expect(result.current.saved).toBe(true)
    expect(result.current.retrying).toBe(false)
  })

  it('leaving page A for page B does not cancel A\'s pending retry', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('A fails'))
    mockUpdateTitle.mockResolvedValueOnce(undefined) // A's retry
    mockUpdateTitle.mockResolvedValue(undefined) // anything else (B's own saves)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result, rerender } = mountDraft(PAGE)

    act(() => {
      result.current.commitLocalEdit([textBlock('a-edit')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)

    rerender(PAGE_B)

    await act(async () => {
      jest.advanceTimersByTime(2000) // A's retry backoff
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE.id,
      [textBlock('a-edit')],
      expect.anything()
    )
  })

  it('a retry stuck mid-backoff when the network drops resumes at once back online', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('network down')) // the original failed save, while online
    mockUpdateTitle.mockResolvedValueOnce(undefined) // the retry, fired once back online
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
    expect(result.current.retrying).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    // The timer already ticking fires while offline: `runRetry` bails out and
    // deletes itself without rescheduling — left alone, this retry never resumes.
    await act(async () => {
      jest.advanceTimersByTime(2000) // first backoff step
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(result.current.retrying).toBe(true)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(result.current.retrying).toBe(false)
    expect(result.current.saved).toBe(true)
  })

  it('page-1 retry landing while page-2 has a pending save does not mark page-2 saved', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('A fails')) // A's original attempt
    mockUpdateTitle.mockResolvedValueOnce(undefined) // A's retry, landing while B is only pending (nothing in flight yet)
    mockUpdateTitle.mockResolvedValueOnce(undefined) // B's own debounced save
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result, rerender } = mountDraft(PAGE)

    act(() => {
      result.current.commitLocalEdit([textBlock('a-edit')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS) // A's save fires and fails; retry backs off 2000ms from here
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)

    rerender(PAGE_B)

    await act(async () => {
      jest.advanceTimersByTime(1500) // well short of A's retry; B hasn't typed yet
      await Promise.resolve()
    })
    act(() => {
      result.current.commitLocalEdit([textBlock('b-edit')])
    })
    expect(result.current.saved).toBe(false)

    // Chained saves run one at a time (KAN-355): A's retry only lands here
    // because nothing is in flight yet — B's own 600ms debounce (scheduled
    // 100ms later) hasn't fired. The open page is B, so A landing must not
    // touch B's `saved`.
    await act(async () => {
      jest.advanceTimersByTime(500) // completes A's 2000ms backoff (600 + 1500 + 500)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(mockUpdateTitle).toHaveBeenNthCalledWith(2, expect.anything(), PAGE.id, expect.anything())
    expect(result.current.saved).toBe(false)

    await act(async () => {
      jest.advanceTimersByTime(100) // completes B's own 600ms debounce (1500 + 600)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(3)
    expect(mockUpdateTitle).toHaveBeenNthCalledWith(3, expect.anything(), PAGE_B.id, expect.anything())
    expect(result.current.saved).toBe(true)
  })

  it('returning to a page with a failed save keeps the edit instead of losing it to a reseed', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('A fails'))
    mockUpdateTitle.mockResolvedValueOnce(undefined) // A's retry, with the edit intact
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result, rerender } = mountDraft(PAGE)

    act(() => {
      result.current.onTitle('x')
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(result.current.retrying).toBe(true)

    rerender(PAGE_B)
    rerender(PAGE)

    expect(result.current.viewTitle).toBe('x')
    expect(result.current.saved).toBe(false)
    expect(result.current.retrying).toBe(true)

    await act(async () => {
      jest.advanceTimersByTime(2000) // first backoff step
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(mockUpdateTitle).toHaveBeenLastCalledWith(expect.anything(), PAGE.id, 'x')
    expect(result.current.saved).toBe(true)
    expect(result.current.retrying).toBe(false)
  })

  it('switching away and back while a newer edit is queued behind the failed one keeps the newer edit', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('v1 fails')) // v1's attempt fails, schedules a retry
    const v2Save = deferred()
    mockUpdateTitle.mockReturnValueOnce(v2Save.promise) // v2's own debounce attempt, left in flight
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result, rerender } = mountDraft(PAGE)

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS) // v1 fires and fails; retry backs off 2000ms from here
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(result.current.retrying).toBe(true)

    // Typed again before the backoff fired: v2's own debounce fires and is
    // left in flight (not yet landed) — still well short of the 2000ms retry.
    act(() => {
      result.current.commitLocalEdit([textBlock('v2')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)

    rerender(PAGE_B)
    rerender(PAGE)

    // The seed effect reseeding page-1 must find v2, not the stale v1 that
    // failed — v2's own save is still in flight, queued ahead of the stale
    // retry payload.
    expect(result.current.viewBlocks).toEqual([textBlock('v2')])
    expect(result.current.saved).toBe(false)

    await act(async () => {
      v2Save.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.saved).toBe(true)
    expect(mockCommitBlocks).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE.id,
      [textBlock('v2')],
      expect.anything()
    )
  })

  it('a save in flight superseded by a newer edit: saved stays false until the newer save lands', async () => {
    const firstSave = deferred()
    mockUpdateTitle.mockReturnValueOnce(firstSave.promise)
    mockUpdateTitle.mockResolvedValueOnce(undefined) // the newer (v2) save
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('v1')])
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS) // v1's save fires, awaiting the network
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)

    // Typed again before v1's save landed.
    act(() => {
      result.current.commitLocalEdit([textBlock('v2')])
    })
    expect(result.current.saved).toBe(false)

    // v1 lands now — it must not mark the draft saved, since v2 is newer.
    await act(async () => {
      firstSave.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.saved).toBe(false)

    // v2's own debounce fires and lands — now it's saved.
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(result.current.saved).toBe(true)
  })

  it('leaving page A for page B online while A\'s debounce is still pending sends A\'s last edit instead of losing it to B\'s', async () => {
    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
    const { result, rerender } = mountDraft(PAGE)

    act(() => {
      result.current.commitLocalEdit([textBlock('a-last')])
    })
    await act(async () => {
      jest.advanceTimersByTime(200) // well short of A's 600ms debounce
      await Promise.resolve()
    })

    rerender(PAGE_B)

    act(() => {
      result.current.commitLocalEdit([textBlock('b-edit')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE.id,
      [textBlock('a-last')],
      expect.anything()
    )
    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE_B.id,
      [textBlock('b-edit')],
      expect.anything()
    )
  })
})

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((res) => {
    resolve = () => res()
  })
  return { promise, resolve }
}
