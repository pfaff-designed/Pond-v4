/**
 * KAN-477: the person's first edit on an unstamped page stamps
 * `childLinksMigrated` alongside that same save — never a separate write, and
 * never ahead of the save that actually carries the derived links.
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { resetPageWriteRegistry } from '@/lib/pages/page-flush'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'
import type { PageRow } from '@/lib/pages/tree'

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

const mockMarkChildLinksMigrated = jest.fn()
jest.mock('@/lib/pages/child-links', () => ({
  ...jest.requireActual('@/lib/pages/child-links'),
  markChildLinksMigrated: (...args: unknown[]) => mockMarkChildLinksMigrated(...args),
}))

const textBlock = (id: string, content: string): Block => ({ id, type: 'text', content }) as Block

const row = (id: string, parentId: string | null, order: number): PageRow => ({
  id,
  parent_id: parentId,
  type: 'page',
  title: id,
  order,
  updated_at: '2026-01-01T00:00:00.000Z',
})

const ROWS: PageRow[] = [row('parent-1', null, 0), row('child-a', 'parent-1', 0), row('child-b', 'parent-1', 1)]

const PAGE: PondPage = {
  id: 'parent-1',
  parentId: null,
  type: 'page',
  title: 'Parent',
  blocks: [],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }
}

function mountDraft(initialPage: PondPage = PAGE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, unmount } = renderHook(
    (page: PondPage) => {
      const getSupabase = useLazySupabase()
      return usePageDraft({
        page,
        pageId: page.id,
        pondId: 'pond-1',
        getSupabase,
        rows: ROWS,
        parentId: page.id,
      })
    },
    { wrapper: wrapper(client), initialProps: initialPage }
  )
  return { result, unmount }
}

beforeEach(() => {
  resetPageWriteRegistry()
  jest.useFakeTimers()
  mockUpdateTitle.mockReset()
  mockCommitBlocks.mockReset()
  mockMarkChildLinksMigrated.mockReset()
  mockUpdateTitle.mockResolvedValue(undefined)
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
  mockMarkChildLinksMigrated.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('usePageDraft child-links stamp (KAN-477)', () => {
  it('a person editing an unstamped page saves the derived links and stamps once', async () => {
    const { result } = mountDraft()

    // Seeded render already shows the two derived page-link rows.
    expect(result.current.viewBlocks).toHaveLength(2)

    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'hello')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    expect(savedBlocks.filter((b) => b.type === 'page-link')).toHaveLength(2)
    expect(savedBlocks.some((b) => b.id === 'typed-1')).toBe(true)

    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
    expect(mockMarkChildLinksMigrated.mock.calls[0][1]).toBe('parent-1')
  })

  it('a second keystroke before the debounce fires does not stamp twice', async () => {
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'h')])
    })
    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'he')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
  })

  it('the stamp is never written when the save it rides on rejects', async () => {
    mockUpdateTitle.mockRejectedValueOnce(new Error('network down'))
    const { result } = mountDraft()

    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'hello')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.retrying).toBe(true)
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()
  })

  it('a reload of an already-migrated page does not re-derive a link the person removed', async () => {
    const migratedPage: PondPage = {
      ...PAGE,
      props: { childLinksMigrated: true },
      blocks: [
        { id: 'derived-link:child-a', type: 'page-link', pageId: 'child-a' },
        { id: 'derived-link:child-b', type: 'page-link', pageId: 'child-b' },
      ],
    }
    const rowsWithThreeChildren: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      (page: PondPage) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({
          page,
          pageId: page.id,
          pondId: 'pond-1',
          getSupabase,
          rows: rowsWithThreeChildren,
          parentId: page.id,
        })
      },
      { wrapper: wrapper(client), initialProps: migratedPage }
    )

    expect(result.current.viewBlocks).toHaveLength(2)
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()
  })

  it('a structural write stamps once; a second landed write does not stamp again', async () => {
    const threeChildRows: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      (page: PondPage) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({
          page,
          pageId: page.id,
          pondId: 'pond-1',
          getSupabase,
          rows: threeChildRows,
          parentId: page.id,
        })
      },
      { wrapper: wrapper(client), initialProps: PAGE }
    )

    expect(result.current.viewBlocks).toHaveLength(3)
    const withoutChildB = result.current.viewBlocks.filter((b) => b.id !== 'derived-link:child-b')

    await act(async () => {
      await result.current.writeStructural(withoutChildB)
    })

    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
    expect(mockMarkChildLinksMigrated.mock.calls[0][1]).toBe('parent-1')

    await act(async () => {
      await result.current.writeStructural(withoutChildB)
    })

    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
  })

  it('a typed edit on an unstamped page records the derived links in `before`, not the stored blocks (⌘Z must not drop them)', async () => {
    const threeChildRows: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      (page: PondPage) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({
          page,
          pageId: page.id,
          pondId: 'pond-1',
          getSupabase,
          rows: threeChildRows,
          parentId: page.id,
        })
      },
      { wrapper: wrapper(client), initialProps: PAGE }
    )

    expect(result.current.viewBlocks).toHaveLength(3)

    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'hello')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const opts = mockCommitBlocks.mock.calls[0][4] as { before: Block[] }
    expect(opts.before.filter((b) => b.type === 'page-link')).toHaveLength(3)
  })

  it('a structural edit on an unstamped page records the derived links in `before`, not the stored blocks', async () => {
    const threeChildRows: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      (page: PondPage) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({
          page,
          pageId: page.id,
          pondId: 'pond-1',
          getSupabase,
          rows: threeChildRows,
          parentId: page.id,
        })
      },
      { wrapper: wrapper(client), initialProps: PAGE }
    )

    expect(result.current.viewBlocks).toHaveLength(3)
    const withoutChildB = result.current.viewBlocks.filter((b) => b.id !== 'derived-link:child-b')

    await act(async () => {
      await result.current.writeStructural(withoutChildB)
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const opts = mockCommitBlocks.mock.calls[0][4] as { before: Block[] }
    expect(opts.before.filter((b) => b.type === 'page-link')).toHaveLength(3)
  })

  it('a hard reload where rows resolve after the page re-derives once ready, with no save or stamp before that', async () => {
    const threeChildRows: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      ({ rows, rowsReady }: { rows: PageRow[]; rowsReady: boolean }) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({
          page: PAGE,
          pageId: PAGE.id,
          pondId: 'pond-1',
          getSupabase,
          rows,
          rowsReady,
          parentId: PAGE.id,
        })
      },
      { wrapper: wrapper(client), initialProps: { rows: [] as PageRow[], rowsReady: false } }
    )

    // `page` resolved before `rows` — the seed has no children to derive against.
    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(0)

    rerender({ rows: threeChildRows, rowsReady: true })

    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(3)
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()

    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'hello')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const savedBlocks = mockCommitBlocks.mock.calls[0][3] as Block[]
    expect(savedBlocks.filter((b) => b.type === 'page-link')).toHaveLength(3)
    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
    expect(mockMarkChildLinksMigrated.mock.calls[0][1]).toBe('parent-1')
  })

  it('a fresh mount of the stamped page with 2 stored links shows 2 rows, no re-derive', () => {
    const threeChildRows: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const migratedPage: PondPage = {
      ...PAGE,
      props: { childLinksMigrated: true },
      blocks: [
        { id: 'derived-link:child-a', type: 'page-link', pageId: 'child-a' },
        { id: 'derived-link:child-c', type: 'page-link', pageId: 'child-c' },
      ],
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      (page: PondPage) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({
          page,
          pageId: page.id,
          pondId: 'pond-1',
          getSupabase,
          rows: threeChildRows,
          parentId: page.id,
        })
      },
      { wrapper: wrapper(client), initialProps: migratedPage }
    )

    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(2)
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()
  })
})

/**
 * KAN-477 fix: the derivation above gates only on `props.childLinksMigrated`,
 * which only reaches the cache AFTER a write lands plus a props read-write. In
 * between, `enqueueStructural`'s own two `['page', id]` cache writes and a
 * `pagesKey` rows-refetch each flow back through `page`/`rows` and re-run the
 * seeding/re-derive effects — which is invisible to the tests above because
 * they pin `page` as a plain render prop, never a live `['page', id]` query.
 * This wrapper reads `page` the same way `DocumentPanel` does, so a cache
 * write made BY `use-page-draft.ts` itself is actually visible to it.
 */
function usePageDraftLive({ rows, parentId }: { rows: PageRow[]; parentId: string | null }) {
  const getSupabase = useLazySupabase()
  const { data: page } = useQuery<PondPage | null>({
    queryKey: ['page', PAGE.id],
    queryFn: () => Promise.resolve(PAGE),
    initialData: PAGE,
    staleTime: Infinity,
  })
  return usePageDraft({ page, pageId: PAGE.id, pondId: 'pond-1', getSupabase, rows, parentId })
}

describe('a derived link the person removes stays removed (KAN-477 fix)', () => {
  it('does not reappear from the write landing, a rows refetch, or the stamp, and stays out of the next typed edit', async () => {
    // Hold the stamp open deliberately, so the test can inspect the exact
    // window the ticket names: the write has landed (its two `['page', id]`
    // cache writes have happened) but `childLinksMigrated` has not reached
    // the cache yet — the window every test above (pinning `page` as a fixed
    // prop) cannot see.
    let resolveStamp: () => void = () => {}
    mockMarkChildLinksMigrated.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStamp = resolve
        })
    )

    const threeChildRows: PageRow[] = [...ROWS, row('child-c', 'parent-1', 2)]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(usePageDraftLive, {
      wrapper: wrapper(client),
      initialProps: { rows: threeChildRows, parentId: 'parent-1' },
    })

    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(3)
    const withoutChildB = result.current.viewBlocks.filter((b) => b.id !== 'derived-link:child-b')

    await act(async () => {
      await result.current.writeStructural(withoutChildB)
    })

    // The write has landed (its own second `['page', id]` write included) but
    // the stamp is still held open — `childLinksMigrated` is still not `true`
    // in the cache. The removed link must still be gone.
    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(2)

    // A rows refetch (commit.ts's `pagesKey` invalidation) resolves with a NEW
    // array identity but the same children, still ahead of the stamp — must
    // not re-trigger derivation either.
    rerender({ rows: [...threeChildRows], parentId: 'parent-1' })
    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(2)

    // Now let the stamp land.
    await act(async () => {
      resolveStamp()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.viewBlocks.filter((b) => b.type === 'page-link')).toHaveLength(2)

    const callsBefore = mockCommitBlocks.mock.calls.length
    act(() => {
      result.current.commitLocalEdit([...result.current.viewBlocks, textBlock('typed-1', 'hello')])
    })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCommitBlocks.mock.calls.length).toBe(callsBefore + 1)
    const savedBlocks = mockCommitBlocks.mock.calls[callsBefore][3] as Block[]
    expect(savedBlocks.filter((b) => b.type === 'page-link')).toHaveLength(2)
  })
})
