'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { PaletteItem } from '@/components/molecules/palette-entries'
import { usePondId } from '@/lib/pond/context'
import type { Database } from '@/lib/supabase/types'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { BLOCK_MIN_QUERY, blockPageLabel, type ParentPageRow } from './palette-blocks'
import { RECORD_DEBOUNCE_MS as BLOCK_DEBOUNCE_MS } from './use-palette-records'

export { BLOCK_DEBOUNCE_MS }

interface BlockRow {
  page_id: string
  block_id: string
  snippet: string
}

const NONE_ROWS: BlockRow[] = []
const NONE_ITEMS: PaletteItem[] = []

async function searchBlocks(
  supabase: SupabaseClient<Database>,
  pondId: string,
  q: string,
  cap: number
): Promise<BlockRow[]> {
  const { data, error } = await supabase.rpc('search_page_blocks', {
    p_pond_id: pondId,
    p_query: q,
    p_limit: cap + 1,
  })
  if (error) throw error
  return data ?? NONE_ROWS
}

/**
 * Body-text matches of `query` for ⌘K's `in pages` group, once it has been
 * still for `BLOCK_DEBOUNCE_MS` — `usePaletteRecords`'s own debounce/settled-
 * query shape, mirrored: its own query key, never `['pages']`. The RPC
 * returns no title, so each row's `label` is built here from `pages`, on
 * every render rather than baked into the cached query result, so a page
 * whose title changes after the search ran still reads current. `cap` is the
 * caller's row limit; one extra row is always asked for so a later "more"
 * row (split to a child ticket) has the signal to show — this hook returns
 * it unsliced.
 *
 * The page and the matched block the open handler needs travel as their own
 * `pageId`/`blockId` fields — `id` stays a stable unique key only, never a
 * fact the caller has to parse back out (AGENTS.md: make state explicit).
 */
export function usePaletteBlocks(
  query: string,
  pages: ParentPageRow[],
  cap: number
): PaletteItem[] {
  const pondId = usePondId()
  const getSupabase = useLazySupabase()
  const settled = useDebouncedValue(query, BLOCK_DEBOUNCE_MS)
  const enabled =
    !!pondId && settled === query && query.length >= BLOCK_MIN_QUERY && query[0] !== '>'
  const { data } = useQuery({
    queryKey: ['palette-blocks', pondId, settled],
    queryFn: () => (pondId ? searchBlocks(getSupabase(), pondId, settled, cap) : NONE_ROWS),
    enabled,
    staleTime: 30_000,
  })
  const rows = enabled && data ? data : NONE_ROWS
  return useMemo(() => {
    // A row's `page_id` can be absent from `pages` — a page staged for
    // client-side delete (`usePagesRows` drops it from the cache at once,
    // ahead of the server) — before the server itself has caught up. Drop
    // it HERE, ahead of `palette-entries.ts`'s cap slice, so an unlabellable
    // row never spends one of the group's slots.
    const pageIds = new Set(pages.map((p) => p.id))
    const visible = rows.filter((row) => pageIds.has(row.page_id))
    return visible.length
      ? visible.map((row) => ({
          id: `${row.page_id}#${row.block_id}`,
          label: blockPageLabel(pages, row.page_id),
          kind: 'block' as const,
          sub: row.snippet,
          pageId: row.page_id,
          blockId: row.block_id,
        }))
      : NONE_ITEMS
  }, [rows, pages])
}
