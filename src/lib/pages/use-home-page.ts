'use client'

/**
 * The rail's own read of the pond's home row (KAN-490).
 *
 * Wraps `getOrCreateHomePage` behind `homeQueryKey` — the SAME cache entry
 * `DocumentPanel` and `AITerminal` already query — so the rail's root-row label
 * and the page surface's root title can never disagree, and a rename written by
 * either redraws both without a second fetch.
 */

import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getOrCreateHomePage, type HomePage } from './home'
import { homeQueryKey } from './keys'

export function useHomePage(pondId: string | null, pondName?: string | null, enabled = true) {
  const getSupabase = useLazySupabase()
  return useQuery<HomePage | null>({
    queryKey: homeQueryKey(pondId),
    queryFn: () => getOrCreateHomePage(getSupabase(), pondId, pondName),
    enabled,
  })
}
