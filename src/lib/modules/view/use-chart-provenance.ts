'use client'

/**
 * The chart card's `on` / `reads` provenance (#227), read off caches the shell has
 * ALREADY filled — never a fetch of this hook's own:
 *
 *   `['pages', workspace]`  the lean tree the rail and the breadcrumb share, exactly
 *                           as `page-link/use-capabilities.ts` reads it (a cache hit)
 *   `['home']`              the home row `DocumentPanel` resolves for every page —
 *                           the breadcrumb's root word (AUDIT W9: "starts at the root
 *                           page", not an assumed name). `enabled: false`: this hook
 *                           subscribes to the cache and never creates the row; off a
 *                           page host it falls back the way the breadcrumb does.
 *
 * Pure derivation is `chartProvenance` (`chart/chrome.ts`); this is only the seam
 * between the caches and that function.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPages } from '@/lib/pages/tree'
import type { HomePage } from '@/lib/pages/home'
import { useWorkspace } from '@/lib/workspace/context'
import { chartProvenance, type ChartProvenance } from '../chart/chrome'

export function useChartProvenance(
  pageId: string | undefined,
  collectionId: string | undefined
): ChartProvenance {
  const workspace = useWorkspace()
  const { data: rows = [] } = useQuery({
    queryKey: ['pages', workspace],
    queryFn: () => fetchPages(workspace),
  })
  const { data: home } = useQuery<HomePage | null>({
    queryKey: ['home'],
    queryFn: () => Promise.resolve(null),
    enabled: false,
  })
  const rootLabel = home?.title
  return useMemo(
    () => chartProvenance(rows, pageId, collectionId, rootLabel),
    [rows, pageId, collectionId, rootLabel]
  )
}
