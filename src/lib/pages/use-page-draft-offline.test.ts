/**
 * Offline (KAN-407): while `navigator.onLine === false`, a scheduled autosave
 * does not hit the network — the edit stays local, `saved` stays false — and
 * the `online` transition flushes the latest draft at once.
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
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
  jest.useFakeTimers()
  mockUpdateTitle.mockReset()
  mockCommitBlocks.mockReset()
  mockUpdateTitle.mockResolvedValue(undefined)
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('usePageDraft offline (KAN-407)', () => {
  it('reports offline once the browser goes offline', () => {
    const { result } = mountDraft()
    expect(result.current.offline).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.offline).toBe(true)
  })

  it('a scheduled save while offline does not hit the network; saved stays false', () => {
    const { result } = mountDraft()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      result.current.commitLocalEdit([textBlock('Hello moon')])
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
    })

    expect(mockUpdateTitle).not.toHaveBeenCalled()
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(result.current.saved).toBe(false)
    expect(result.current.offline).toBe(true)
  })

  it('an edit made going offline mid-debounce still stays local once the pause fires', () => {
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([textBlock('Hello moon')])
    })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
    })

    expect(mockUpdateTitle).not.toHaveBeenCalled()
    expect(result.current.saved).toBe(false)
  })

  it('the online transition flushes the LATEST draft at once and clears offline', async () => {
    const { result } = mountDraft()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      result.current.commitLocalEdit([textBlock('first')])
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
    })
    // Still offline: typed again before reconnecting — the flush must send this one.
    act(() => {
      result.current.commitLocalEdit([textBlock('second')])
    })

    expect(mockCommitBlocks).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(result.current.offline).toBe(false)
    expect(mockUpdateTitle).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE.id,
      [textBlock('second')],
      expect.anything()
    )
    expect(result.current.saved).toBe(true)
  })

  it('held drafts for two different pages both survive and both save on reconnect', async () => {
    const { result, rerender } = mountDraft(PAGE)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      result.current.commitLocalEdit([textBlock('page-1 edit')])
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS) // page-1's draft is now held, offline
    })

    rerender(PAGE_B)
    act(() => {
      result.current.commitLocalEdit([textBlock('page-2 edit')])
    })
    act(() => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS) // page-2's draft is now held too, offline
    })

    const event = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockUpdateTitle).toHaveBeenCalledTimes(2)
    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE.id,
      [textBlock('page-1 edit')],
      expect.anything()
    )
    expect(mockCommitBlocks).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      PAGE_B.id,
      [textBlock('page-2 edit')],
      expect.anything()
    )
  })
})
