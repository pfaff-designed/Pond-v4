'use client'

/**
 * Client compute seam for a page's backlinks (#39, #20 second-half slice B). Backlinks
 * are DERIVED on read (see compute-backlinks.ts): no stored mirror, no cascade. This
 * hook does the two reads the pure core needs and keeps the reverse live for free by
 * reusing the exact caches the rest of the app already primes + invalidates:
 *   - `['pages', workspace, 'full']` — the whole workspace page list (with props, so
 *     each collection's `_schema` is present). The SAME cache `use-relation-titles`
 *     reads for its untargeted candidate list — discovery scans it for relation
 *     properties that could point at the target.
 *   - `['rows', collectionId]` — each discovered source collection's rows WITH props
 *     (shared with the relation field + inline views). Filtered to the rows whose
 *     relation value contains the target's id.
 *
 * Because both reads are the shared caches, editing a forward relation cell (which
 * writes through `['rows', sourceCollectionId]`) makes the backlink appear/disappear on
 * the next read with no extra wiring — the derived-not-stored invariant, for free.
 *
 * CRITICAL: the Supabase client is built lazily INSIDE each queryFn (never at render),
 * so seeded/disabled queries (Storybook, envless CI) never construct a real client and
 * throw — mirroring `use-rollup` / `use-relation-titles`.
 */
import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getCollectionRows, listPages, type PondPage } from '@/lib/pages/client'
import { useWorkspace } from '@/lib/workspace/context'
import {
  findBacklinkSources,
  computeBacklinks,
  type BacklinkCandidate,
  type BacklinkGroup,
} from '@/lib/modules/view/compute-backlinks'

export interface UseBacklinks {
  /** The inbound links, grouped by source property; empty when nothing links here. */
  groups: BacklinkGroup[]
  /** True while the workspace list or any source collection's rows are still loading. */
  loading: boolean
}

const EMPTY: BacklinkGroup[] = []

/**
 * Resolve the backlinks for the target page `targetId`, whose collection is
 * `targetCollectionId` (the target row's parent collection; `null`/`undefined` for a
 * plain page that belongs to no collection — only untargeted relations can then link
 * it). Pass `targetId === undefined` to disable the hook entirely (no open page).
 */
export function useBacklinks(
  targetId: string | undefined,
  targetCollectionId: string | null | undefined
): UseBacklinks {
  const workspace = useWorkspace()
  // Lazily created on first fetch, not at render — so seeded/disabled queries never
  // construct a real client and throw (envless CI/Storybook).
  const getSupabase = useLazySupabase()

  const enabled = !!targetId

  // The whole workspace list (with props → schemas), for candidate discovery. Same key
  // `use-relation-titles` uses, so the fetch is shared, not duplicated.
  const { data: allPages, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages', workspace, 'full'] as const,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? listPages(supabase, user.id, workspace) : []
    },
    enabled,
  })

  // Discover the source (collection, relation property) pairs from the schemas, then the
  // DISTINCT source collections whose rows we must scan (one fetch per collection even
  // when it holds several matching relation properties).
  const sources = useMemo(
    () => (allPages ? findBacklinkSources(allPages, targetCollectionId ?? null) : []),
    [allPages, targetCollectionId]
  )
  const sourceCollectionIds = useMemo(
    () => Array.from(new Set(sources.map((s) => s.sourceCollectionId))),
    [sources]
  )

  // Each source collection's rows — the shared `['rows', id]` cache, so a forward-link
  // edit keeps the reverse live.
  const rowQueries = useQueries({
    queries: sourceCollectionIds.map((collectionId) => ({
      queryKey: ['rows', collectionId] as const,
      queryFn: async () => {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return [] as PondPage[]
        return getCollectionRows(supabase, user.id, collectionId, workspace)
      },
      enabled,
    })),
  })

  return useMemo<UseBacklinks>(() => {
    if (!targetId) return { groups: EMPTY, loading: false }
    const rowsByCollection = new Map<string, PondPage[]>()
    sourceCollectionIds.forEach((id, i) => {
      rowsByCollection.set(id, rowQueries[i]?.data ?? [])
    })
    const candidates: BacklinkCandidate[] = sources.map((s) => ({
      ...s,
      rows: rowsByCollection.get(s.sourceCollectionId) ?? [],
    }))
    const groups = computeBacklinks(targetId, candidates)
    const loading = pagesLoading || rowQueries.some((q) => q.isLoading)
    return { groups, loading }
    // rowQueries is a fresh array each render; the source ids + resolved data drive it.
  }, [targetId, sources, sourceCollectionIds, rowQueries, pagesLoading])
}
