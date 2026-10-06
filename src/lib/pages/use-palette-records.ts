'use client'

import { useQuery } from '@tanstack/react-query'

import type { PaletteItem } from '@/components/molecules/palette-entries'
import { usePondId } from '@/lib/pond/context'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { RECORD_MIN_QUERY, searchRecords } from './palette-records'

export const RECORD_DEBOUNCE_MS = 200
const NONE: PaletteItem[] = []

/**
 * Records matching `query`, once it has been still for `RECORD_DEBOUNCE_MS`. Their
 * own query key — never `pagesKey()`, which records must not enter. Empty until the
 * settled query is the one on the line, so a slow answer to `ca` is never shown
 * under `cab`. `query` is already trimmed and lowercased; a leading `>` is the
 * actions-only mode, which lists no records.
 */
export function usePaletteRecords(query: string): PaletteItem[] {
  const pondId = usePondId()
  const getSupabase = useLazySupabase()
  const settled = useDebouncedValue(query, RECORD_DEBOUNCE_MS)
  const enabled =
    !!pondId && settled === query && query.length >= RECORD_MIN_QUERY && query[0] !== '>'
  const { data } = useQuery({
    queryKey: ['palette-records', pondId, settled],
    queryFn: () => (pondId ? searchRecords(getSupabase(), pondId, settled) : NONE),
    enabled,
    staleTime: 30_000,
  })
  return enabled && data ? data : NONE
}
