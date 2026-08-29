/**
 * Cross-page metric read seam (ticket-38) — the CLIENT half of cross-page/aggregate
 * derivation.
 *
 * This proves the two things a pure test can't:
 *   1. loading/stale gating — while a needed page is fetching, `loaded` is false (→ the
 *      view shows a placeholder, never a wrong number); a resolved-but-missing page is
 *      simply absent from the map (→ derive reads it as stale).
 *   2. INVALIDATION FRESHNESS TRACE — the whole "stays live with zero extra wiring"
 *      claim. The hook reads the SAME `['page', id]` and `['pages']` caches that
 *      accept.ts (`invalidateQueries(['page', target])`) and commit.ts
 *      (`invalidateQueries(['pages'])`) already invalidate. We fire EXACTLY those
 *      invalidations and assert the hook re-derives from fresh data.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCrossPageBlocks } from '@/lib/modules/metric/use-cross-page-metric'
import { deriveMetricValue } from '@/lib/modules/metric/derive'
import type { MetricSource } from '@/lib/modules/metric/schema'
import type { MetricBlock } from '@/lib/modules/metric/schema'
import type { PageRow } from '@/lib/pages/tree'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...a: unknown[]) => mockGetPage(...a),
}))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...a: unknown[]) => mockFetchPages(...a),
}))

// A todo block factory — checkedCount ticked of `total`.
function todo(id: string, checked: number, total: number) {
  return {
    id,
    type: 'todo' as const,
    items: Array.from({ length: total }, (_, i) => ({
      id: `${id}-i${i}`,
      label: `item ${i}`,
      checked: i < checked,
    })),
  }
}

function pageWith(id: string, blocks: unknown[]): PondPage {
  return {
    id,
    parentId: null,
    type: 'page',
    title: id,
    blocks: blocks as PondPage['blocks'],
    status: null,
    order: 0,
  }
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  mockGetPage.mockReset()
  mockFetchPages.mockReset()
})

// Convenience: derive a metric bound to `source` given this hook's cross resolution.
function metricFor(source: MetricSource): MetricBlock {
  return { id: 'm', type: 'metric', label: 'x', value: -1, source }
}

describe('useCrossPageBlocks — cross-page single block', () => {
  const source: MetricSource = { pageId: 'page-A', blockId: 'todo-1', kind: 'checklist-checked' }

  it('pending → loaded: derive shows a placeholder, then the live count', async () => {
    // A controllable promise so we can observe the pending window deterministically.
    let resolve!: (p: PondPage) => void
    mockGetPage.mockReturnValue(new Promise<PondPage>((r) => (resolve = r)))

    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(source, undefined), {
      wrapper: wrapper(client),
    })

    // While page-A is in flight: loaded is false → derive is pending (placeholder).
    expect(result.current.loaded).toBe(false)
    expect(deriveMetricValue(metricFor(source), [], result.current)).toEqual({ state: 'pending' })

    resolve(pageWith('page-A', [todo('todo-1', 2, 5)]))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(deriveMetricValue(metricFor(source), [], result.current)).toEqual({
      state: 'derived',
      value: 2,
      sourceId: 'todo-1',
    })
  })

  it('resolved-but-missing page → absent from the map → derive reads stale', async () => {
    mockGetPage.mockResolvedValue(null) // page-A deleted / unreachable
    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(source, undefined), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.blocksByPage.has('page-A')).toBe(false)
    expect(deriveMetricValue(metricFor(source), [], result.current).state).toBe('stale')
  })

  it('FRESHNESS: invalidating ["page", id] (what accept.ts fires) re-derives live', async () => {
    // First fetch: 1 checked. After an accepted edit lands on page-A, accept.ts calls
    // invalidateQueries(['page','page-A']); the hook's query refetches → new count.
    mockGetPage.mockResolvedValueOnce(pageWith('page-A', [todo('todo-1', 1, 5)]))
    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(source, undefined), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(deriveMetricValue(metricFor(source), [], result.current)).toMatchObject({ value: 1 })

    // The edit landed on page-A: next fetch returns 3 checked, then the invalidation.
    mockGetPage.mockResolvedValueOnce(pageWith('page-A', [todo('todo-1', 3, 5)]))
    await client.invalidateQueries({ queryKey: ['page', 'page-A'] })

    await waitFor(() =>
      expect(deriveMetricValue(metricFor(source), [], result.current)).toMatchObject({ value: 3 })
    )
  })
})

describe('useCrossPageBlocks — child-pages aggregate', () => {
  const source: MetricSource = { pages: 'children', kind: 'checklist-checked' }
  const holdingPage = 'parent-1'

  const rows = (childIds: string[]): PageRow[] =>
    childIds.map((id) => ({
      id,
      parent_id: holdingPage,
      type: 'page',
      title: id,
      order: 0,
      updated_at: '',
    }))

  it('pending until the ["pages"] tree resolves; then sums across children', async () => {
    mockFetchPages.mockResolvedValue(rows(['c1', 'c2']))
    mockGetPage.mockImplementation((_sb: unknown, id: string) =>
      Promise.resolve(
        pageWith(id, [id === 'c1' ? todo('t', 1, 2) : todo('t', 2, 3)]) // 1 + 2 = 3
      )
    )
    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(source, holdingPage), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect([...result.current.childPageIds].sort()).toEqual(['c1', 'c2'])
    expect(deriveMetricValue(metricFor(source), [], result.current)).toEqual({
      state: 'aggregate',
      value: 3,
      pageCount: 2,
    })
  })

  it('stays pending when the holding page id is unknown (no children to scope to)', async () => {
    mockFetchPages.mockResolvedValue(rows(['c1']))
    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(source, undefined), {
      wrapper: wrapper(client),
    })
    // No pageId → cannot resolve the child scope → held pending (never "across 0 pages").
    expect(deriveMetricValue(metricFor(source), [], result.current)).toEqual({ state: 'pending' })
  })

  it('FRESHNESS: invalidating ["pages"] (what commit.ts fires) picks up a new child', async () => {
    // A child page added/removed invalidates ['pages'] in commit.ts. The child-id set
    // must recompute and the new child's blocks must fold into the rollup.
    mockFetchPages.mockResolvedValueOnce(rows(['c1']))
    mockGetPage.mockImplementation((_sb: unknown, id: string) =>
      Promise.resolve(pageWith(id, [todo('t', 1, 2)]))
    )
    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(source, holdingPage), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(deriveMetricValue(metricFor(source), [], result.current)).toMatchObject({
      value: 1,
      pageCount: 1,
    })

    // A second child page is created under the parent → ['pages'] invalidates.
    mockFetchPages.mockResolvedValueOnce(rows(['c1', 'c2']))
    await client.invalidateQueries({ queryKey: ['pages'] })

    await waitFor(() =>
      expect(deriveMetricValue(metricFor(source), [], result.current)).toMatchObject({
        value: 2, // c1 (1) + c2 (1)
        pageCount: 2,
      })
    )
  })
})

describe('useCrossPageBlocks — no fetch when not needed', () => {
  it('a same-page source triggers no cross-page fetch and resolves loaded/empty', () => {
    const client = freshClient()
    const { result } = renderHook(
      () => useCrossPageBlocks({ blockId: 'b', kind: 'checklist-checked' }, 'p'),
      { wrapper: wrapper(client) }
    )
    expect(result.current.loaded).toBe(true)
    expect(result.current.blocksByPage.size).toBe(0)
    expect(mockGetPage).not.toHaveBeenCalled()
    expect(mockFetchPages).not.toHaveBeenCalled()
  })

  it('an unbound metric (no source) needs nothing', () => {
    const client = freshClient()
    const { result } = renderHook(() => useCrossPageBlocks(undefined, 'p'), {
      wrapper: wrapper(client),
    })
    expect(result.current.loaded).toBe(true)
    expect(mockGetPage).not.toHaveBeenCalled()
  })
})
