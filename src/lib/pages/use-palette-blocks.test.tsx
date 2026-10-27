/**
 * `usePaletteBlocks`'s debounce/settled-query gating — the same shape, and
 * the same real-timer wait (`palette-records-ponds.test.tsx`'s "searched once
 * per settled query" suite) `usePaletteRecords` is tested through, exercised
 * directly here since this hook has no shell wiring yet (KAN-473's next item).
 */
import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/lib/pond/context', () => ({ usePondId: () => 'pond-1' }))

const rpc = jest.fn()
jest.mock('@/lib/supabase/use-lazy-client', () => ({
  useLazySupabase: () => () => ({ rpc }),
}))

import { usePaletteBlocks } from './use-palette-blocks'
import type { ParentPageRow } from './palette-blocks'

const PAGES: ParentPageRow[] = [
  { id: 'area', parentId: null, type: 'home', title: 'kitchen' },
  { id: 'page', parentId: 'area', type: 'page', title: 'electrician' },
]

const SNIPPET = 'call the electrician for the second fix'
const ROW = { page_id: 'page', block_id: 'b1', snippet: SNIPPET }
const ITEM = {
  id: 'page#b1',
  label: 'kitchen › electrician',
  kind: 'block',
  sub: SNIPPET,
  pageId: 'page',
  blockId: 'b1',
}

type Props = { q: string; p: ParentPageRow[]; c: number }

/** Mounts with nothing typed, as the real palette does, so the first
 *  non-empty query still runs through a genuine debounce window rather than
 *  `useDebouncedValue`'s initial-render value (equal to itself, undelayed). */
function mountBlocks(pages: ParentPageRow[] = PAGES, cap = 6) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...renderHook(({ q, p, c }: Props) => usePaletteBlocks(q, p, c), {
      initialProps: { q: '', p: pages, c: cap },
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }),
  }
}

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: [ROW], error: null })
})

describe('usePaletteBlocks', () => {
  it('searches once the query has been still for 200ms, in the active pond', async () => {
    const { result, rerender } = mountBlocks()
    rerender({ q: 'second', p: PAGES, c: 6 })
    await waitFor(() => expect(result.current).toEqual([ITEM]))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('search_page_blocks', {
      p_pond_id: 'pond-1',
      p_query: 'second',
      p_limit: 7,
    })
  })

  it('asks for cap + 1 rows, unsliced, so a caller can tell a further match exists', async () => {
    const { result, rerender } = mountBlocks(PAGES, 2)
    rerender({ q: 'second', p: PAGES, c: 2 })
    await waitFor(() => expect(result.current).toEqual([ITEM]))
    expect(rpc).toHaveBeenCalledWith('search_page_blocks', expect.objectContaining({ p_limit: 3 }))
  })

  it('are searched once per settled query — typing fast does not search each letter', async () => {
    const { result, rerender } = mountBlocks()
    rerender({ q: 's', p: PAGES, c: 6 })
    rerender({ q: 'se', p: PAGES, c: 6 })
    rerender({ q: 'second', p: PAGES, c: 6 })
    await waitFor(() => expect(result.current).toEqual([ITEM]))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('search_page_blocks', expect.objectContaining({ p_query: 'second' }))
  })

  it('is not searched below BLOCK_MIN_QUERY, or for a `>` actions-only line', async () => {
    const { result, rerender } = mountBlocks()
    rerender({ q: 's', p: PAGES, c: 6 })
    await wait(350)
    rerender({ q: '> second', p: PAGES, c: 6 })
    await wait(350)
    expect(rpc).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it('a search that has not answered lists none, and a stale answer is not shown under a new query', async () => {
    let resolve: ((v: unknown) => void) | undefined
    rpc.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { result, rerender } = mountBlocks()
    rerender({ q: 'second', p: PAGES, c: 6 })
    await wait(350)
    expect(result.current).toEqual([])

    rerender({ q: 'third', p: PAGES, c: 6 })
    await act(async () => resolve?.({ data: [ROW], error: null }))
    expect(result.current).toEqual([])
  })

  it('drops a row whose page is absent from the pages tree (staged for client-side delete)', async () => {
    const orphanRow = { page_id: 'gone', block_id: 'b1', snippet: SNIPPET }
    rpc.mockResolvedValue({ data: [orphanRow], error: null })
    const { result, rerender } = mountBlocks()
    rerender({ q: 'second', p: PAGES, c: 6 })
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    await wait(50)
    expect(result.current).toEqual([])
  })

  it("never touches the ['pages'] query cache", async () => {
    const { result, queryClient, rerender } = mountBlocks()
    rerender({ q: 'second', p: PAGES, c: 6 })
    await waitFor(() => expect(result.current).toEqual([ITEM]))
    expect(queryClient.getQueryCache().findAll({ queryKey: ['pages'] })).toEqual([])
    expect(
      queryClient.getQueryCache().find({ queryKey: ['palette-blocks', 'pond-1', 'second'] })?.state
        .data
    ).toEqual([ROW])
  })
})
