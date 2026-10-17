'use client'

/**
 * Hover/focus prefetch for a page (KAN-388): a rail row, page-link row or
 * palette item calls this per id and spreads the handlers onto its pointer
 * and focus events. Both intents go through the same 60ms hold, cleared on
 * leave/blur/unmount/re-enter — that single hold is what keeps a fast sweep
 * down the rail (pointer or roving keyboard focus) from firing a prefetch
 * per row it passes through.
 *
 * Reads the raw context (not `useQueryClient()`, which throws without a
 * provider) — the rail row calling this is presentational and is rendered
 * standalone in Storybook and several existing `rail-*` tests with no
 * `QueryClientProvider` above it; there, prefetch is just a no-op.
 */

import { useContext, useEffect, useRef } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { pageQueryOptions } from './page-query'

const PREFETCH_HOLD_MS = 60

export function usePagePrefetchHandlers(id: string, getSupabase: () => SupabaseClient<Database>) {
  const queryClient = useContext(QueryClientContext)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = () => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  // Unmounting mid-hold (the row scrolled out, or was removed) must not fire
  // a prefetch for a row nobody can see the result of.
  useEffect(() => clearPending, [])

  const startHold = () => {
    clearPending()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const options = pageQueryOptions(getSupabase, id)
      // An id already in the cache (even stale, past the 30s staleTime) is
      // skipped outright — not just left to `prefetchQuery`'s own staleTime
      // check — because the OPEN page's own rail row hovers constantly, and
      // a stale-triggered refetch there would overwrite blocks typed under
      // an active editor mid-debounce.
      if (queryClient?.getQueryData(options.queryKey) !== undefined) return
      queryClient?.prefetchQuery(options)
    }, PREFETCH_HOLD_MS)
  }

  return {
    onPointerEnter: startHold,
    onPointerLeave: clearPending,
    onFocus: startHold,
    onBlur: clearPending,
  }
}
