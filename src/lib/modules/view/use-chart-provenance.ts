'use client'

/**
 * The chart card's `on` / `reads` provenance (#227), read off caches the shell
 * usually has already filled:
 *
 *   `pagesKey()`  the lean tree the rail and the breadcrumb share, exactly
 *                           as `page-link/use-capabilities.ts` reads it. **On the
 *                           page surface this is a cache hit** — `BlockCanvas`
 *                           mounts that hook above every view block. It is NOT a
 *                           hit on the hosts where `ViewView` renders without
 *                           `BlockCanvas` (a diff card, the create-page proposal); there this is the first observer
 *                           and it does fetch. That is honest rather than ideal:
 *                           the alternative is passing the trail down through four
 *                           hosts for a footer, and an empty cache degrades to the
 *                           page's own title rather than rendering a wrong path.
 *   `homeQueryKey()`        the pond's root page, the home row `DocumentPanel`
 *                           resolves for every page and keeps renamed — the
 *                           breadcrumb's root word (AUDIT W9: "starts at the
 *                           root page", not an assumed name). Scoped to the pond
 *                           like the tree, so this reads the same pond's root
 *                           the panel loaded; until it has, the path falls back
 *                           to `life`. Read with
 *                           `getQueryData`, NOT a disabled `useQuery`: an observer
 *                           carries its `queryFn` onto the shared Query, so a stub
 *                           `() => null` would become the producer for the whole
 *                           app the moment anything refetched that key off the
 *                           cache rather than off `DocumentPanel`'s own observer.
 *                           Nothing invalidates the home key today; a reader
 *                           with no observer cannot start.
 *
 * Pure derivation is `chartProvenance` (`chart/chrome.ts`); this is only the seam
 * between the caches and that function.
 */

import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { homeQueryKey } from '@/lib/pages/keys'
import type { HomePage } from '@/lib/pages/home'
import { usePagesRows } from '@/lib/pages/use-pages'
import { usePondId } from '@/lib/pond/context'
import { chartProvenance, type ChartProvenance } from '../chart/chrome'

export function useChartProvenance(
  pageId: string | undefined,
  collectionId: string | undefined
): ChartProvenance {
  const pondId = usePondId()
  const queryClient = useQueryClient()
  const { data: rows } = usePagesRows(pondId)
  // A read, not a subscription: the root word only changes when the person renames
  // the home row, which re-renders this tree through `DocumentPanel` anyway.
  const rootLabel = queryClient.getQueryData<HomePage | null>(homeQueryKey(pondId))?.title
  return useMemo(
    () => chartProvenance(rows, pageId, collectionId, rootLabel),
    [rows, pageId, collectionId, rootLabel]
  )
}
