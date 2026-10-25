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
import { QueryClientContext, type QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { pageQueryOptions } from './page-query'
import { LIFE_ID, DATABASES_PLACEHOLDER_ID } from '@/lib/rail/tree'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { TRASH_NODE_ID, SETTINGS_NODE_ID } from '@/lib/change-log/trash-view'

const PREFETCH_HOLD_MS = 60

/** True for a rail row with no `pages` row behind it — the Life root, the
 *  databases-placeholder, the change log, trash, or settings — so a
 *  page-id-keyed fetch (`getPage`/prefetch) never runs against it. One home
 *  for the list, reused by `usePagePrefetchHandlers` and `rowCapabilities`
 *  (Rail.tsx) wherever these ids are checked together. */
export function isPseudoPageId(id: string): boolean {
  return (
    id === LIFE_ID ||
    id === DATABASES_PLACEHOLDER_ID ||
    id === CHANGE_LOG_NODE_ID ||
    id === TRASH_NODE_ID ||
    id === SETTINGS_NODE_ID
  )
}

/**
 * Shared by every prefetch site (this hook's hold, and `ShellCommands`'
 * un-held active-row prefetch) so the "already cached" skip can't drift
 * between them — a stale-but-present `['page', id]` entry (the open page's
 * own row, past its 30s staleTime) must never be refetched under a live
 * editor regardless of which caller triggers it.
 */
export function prefetchPageIfAbsent(
  queryClient: QueryClient | undefined,
  getSupabase: () => SupabaseClient<Database>,
  id: string
) {
  const options = pageQueryOptions(getSupabase, id)
  if (queryClient?.getQueryData(options.queryKey) !== undefined) return
  queryClient?.prefetchQuery(options)
}

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
    if (isPseudoPageId(id)) return
    clearPending()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      prefetchPageIfAbsent(queryClient, getSupabase, id)
    }, PREFETCH_HOLD_MS)
  }

  return {
    onPointerEnter: startHold,
    onPointerLeave: clearPending,
    onFocus: startHold,
    onBlur: clearPending,
  }
}
