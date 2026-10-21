'use client'

/**
 * The shared `['pages']` read, staged deletes filtered out live (KAN-310 gap 1).
 *
 * Wraps the same `pagesKey`/`fetchPages` query every surface already shares,
 * then drops any row whose id is mid-delete (`staged-ids.ts`) via
 * `useSyncExternalStore` — so a reader built on this hook sees a staged
 * delete disappear the instant the rail stages it, and reappear on undo, with
 * no refetch either way. `useSyncExternalStore` requires a snapshot that is
 * referentially stable when nothing changed (else every render looks like a
 * change and re-renders forever) — the filtered array is cached against the
 * query's own `rows` reference and the staged registry's version counter,
 * and only recomputed when either moves.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchPages, type PageRow } from './tree'
import { listPages, type PondPage } from './client'
import { pagesKey } from './keys'
import { isStaged, subscribeStaged, stagedVersionNow } from '@/lib/deletion/staged-ids'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'

const EMPTY_ROWS: PageRow[] = []

export type PagesRowsResult = {
  data: PageRow[]
  isPending: boolean
  isSuccess: boolean
}

export function usePagesRows(
  pondId: string | null,
  options?: { enabled?: boolean }
): PagesRowsResult {
  const query = useQuery({
    queryKey: pagesKey(pondId),
    queryFn: () => fetchPages(pondId),
    enabled: options?.enabled,
  })
  const rows = query.data ?? EMPTY_ROWS

  const cache = useRef<{ rows: PageRow[]; version: number; result: PageRow[] } | null>(null)
  const getSnapshot = useCallback(() => {
    const version = stagedVersionNow()
    const cached = cache.current
    if (cached && cached.rows === rows && cached.version === version) return cached.result
    const result = rows.filter((row) => !isStaged(row.id))
    cache.current = { rows, version, result }
    return result
  }, [rows])

  const liveRows = useSyncExternalStore(subscribeStaged, getSnapshot, getSnapshot)

  return { data: liveRows, isPending: query.isPending, isSuccess: query.isSuccess }
}

/**
 * The shared `[...pagesKey(pondId), 'full']` read `ChangeLogPage` and
 * `TrashPage` both need — the same page/title lookup off `listPages`
 * (no staged-delete filtering; `usePagesRows` above is for the rail/live
 * tree, this is for a table reading titles and area chains).
 */
export function useFullPages(pondId: string | null) {
  const getSupabase = useLazySupabase()
  return useQuery({
    queryKey: [...pagesKey(pondId), 'full'] as const,
    queryFn: async (): Promise<PondPage[]> => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      return listPages(supabase, user.id, pondId)
    },
  })
}
