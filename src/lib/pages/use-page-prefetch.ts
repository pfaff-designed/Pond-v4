'use client'

/**
 * Hover/focus prefetch for a page (KAN-388): a rail row, page-link row or
 * palette item calls this per id and spreads the handlers onto its pointer
 * events. The 60ms hold (cleared on leave) is what keeps a fast sweep down
 * the rail from firing a prefetch per row; focus prefetches at once since a
 * keyboard move has no analogous "hover past it" case.
 *
 * Reads the raw context (not `useQueryClient()`, which throws without a
 * provider) — the rail row calling this is presentational and is rendered
 * standalone in Storybook and several existing `rail-*` tests with no
 * `QueryClientProvider` above it; there, prefetch is just a no-op.
 */

import { useContext, useRef } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { pageQueryOptions } from './page-query'

const PREFETCH_HOLD_MS = 60

export function usePagePrefetchHandlers(id: string, getSupabase: () => SupabaseClient<Database>) {
  const queryClient = useContext(QueryClientContext)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prefetch = () => {
    queryClient?.prefetchQuery(pageQueryOptions(getSupabase, id))
  }

  const onPointerEnter = () => {
    timerRef.current = setTimeout(prefetch, PREFETCH_HOLD_MS)
  }

  const onPointerLeave = () => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  return { onPointerEnter, onPointerLeave, onFocus: prefetch }
}
