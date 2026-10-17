'use client'

/**
 * Hover/focus prefetch for a page (KAN-388): a rail row, page-link row or
 * palette item calls this per id and spreads the handlers onto its pointer
 * events. The 60ms hold (cleared on leave) is what keeps a fast sweep down
 * the rail from firing a prefetch per row; focus prefetches at once since a
 * keyboard move has no analogous "hover past it" case.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { pageQueryOptions } from './page-query'

const PREFETCH_HOLD_MS = 60

export function usePagePrefetchHandlers(id: string, getSupabase: () => SupabaseClient<Database>) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prefetch = () => {
    queryClient.prefetchQuery(pageQueryOptions(getSupabase, id))
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
