'use client'

/**
 * Cross-page metric read seam (ticket-38) — the CLIENT half of cross-page/aggregate
 * derivation, kept apart from the pure `derive.ts` so that stays server-safe.
 *
 * A cross-page or aggregate metric needs OTHER pages' blocks, which the pure core can't
 * fetch. This hook resolves them through react-query — the SAME `['page', id]` cache the
 * editor and the cross-page-edit preview read, and the SAME `['pages']` tree the rail and
 * overview surfaces read — so the invalidations that already fire on a commit/accept
 * (`['page', target]`, `['pages']`) keep these rollups fresh with zero extra wiring:
 *
 *   - a same-page checklist toggle re-renders the metric (SiblingBlocks) — unchanged;
 *   - an accept on a BOUND page invalidates `['page', that-id]`, this hook's query
 *     refetches, the rollup re-derives;
 *   - a child page added/removed invalidates `['pages']`, the child-id set recomputes.
 *
 * It hands the pure `deriveMetricValue` a `CrossPageBlocks` resolution: while any needed
 * page is still fetching, `loaded: false` → the view shows a quiet placeholder, NEVER a
 * wrong number. A resolved-but-missing page (deleted) surfaces as `stale` downstream.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getPage } from '@/lib/pages/client'
import { fetchPages, type PageRow } from '@/lib/pages/tree'
import type { Block } from '../content'
import type { MetricSource } from './schema'
import { isAggregateSource, isCrossPageSource } from './schema'
import type { CrossPageBlocks } from './derive'

/** An empty, already-loaded resolution — for metrics that need no cross-page read. */
const NOT_NEEDED: CrossPageBlocks = { loaded: true, blocksByPage: new Map(), childPageIds: [] }

/**
 * Resolve the OTHER-page blocks a cross-page/aggregate metric needs.
 *
 * `source` — the metric's binding (only cross-page/aggregate forms trigger any fetch;
 *   a same-page or absent source resolves to the empty NOT_NEEDED with no query work).
 * `pageId` — the id of the page HOLDING the metric, from SiblingBlocks (aggregate needs
 *   it to find the direct children). Absent → aggregate can't resolve → stays pending.
 *
 * Hooks are always called (Rules of Hooks); the query lists are empty when the source
 * needs nothing, so no request is made.
 */
export function useCrossPageBlocks(
  source: MetricSource | undefined,
  pageId: string | undefined
): CrossPageBlocks {
  const isAggregate = !!source && isAggregateSource(source)
  const isCrossPage = !!source && isCrossPageSource(source)

  // The ['pages'] tree — only actually needed for the aggregate scope, but the query is
  // shared (rail/overview already prime it), so subscribing is nearly free. `enabled`
  // keeps a non-aggregate metric from forcing the fetch — and, crucially, from
  // constructing a Supabase client at all (the queryFn is the only place `createClient`
  // runs), so an unbound/same-page metric — the overwhelming majority — stays inert and
  // renders fine anywhere (Storybook, the AI-terminal reference render, jest).
  const { data: allPages, isPending: pagesPending } = useQuery({
    queryKey: ['pages'],
    queryFn: fetchPages,
    enabled: isAggregate,
  })

  // The direct child page ids of the holding page (aggregate scope). Empty until the
  // tree loads or when we have no holding-page identity.
  const childPageIds = useMemo(() => {
    if (!isAggregate || !pageId || !allPages) return []
    return (allPages as PageRow[]).filter((p) => p.parent_id === pageId).map((p) => p.id)
  }, [isAggregate, pageId, allPages])

  // The set of OTHER page ids whose blocks we must read: one for a cross-page block, or
  // every child for an aggregate. De-duped, stable order.
  const targetPageIds = useMemo(() => {
    if (isCrossPage && source) return [(source as { pageId: string }).pageId]
    if (isAggregate) return childPageIds
    return []
  }, [isCrossPage, isAggregate, source, childPageIds])

  const pageQueries = useQueries({
    queries: targetPageIds.map((id) => ({
      queryKey: ['page', id],
      // Construct the client lazily, only when this query actually runs — a same-page or
      // unbound metric (no targets) never gets here, so it never needs Supabase env.
      queryFn: () => getPage(createClient(), id),
    })),
  })

  return useMemo<CrossPageBlocks>(() => {
    if (!isAggregate && !isCrossPage) return NOT_NEEDED

    // Aggregate can't even name its targets until the ['pages'] tree resolves — hold in
    // pending rather than derive "across 0 pages" from a not-yet-loaded child set.
    if (isAggregate && (!pageId || pagesPending)) return { ...NOT_NEEDED, loaded: false }

    // Loaded only when every needed page query has settled (success OR error — an errored
    // page is treated as gone/missing downstream, not an eternal spinner).
    const loaded = pageQueries.every((q) => !q.isPending)

    const blocksByPage = new Map<string, readonly Block[]>()
    targetPageIds.forEach((id, i) => {
      const page = pageQueries[i]?.data
      // Only a resolved page contributes blocks; a missing/errored one is simply absent
      // from the map → derive reads it as stale (cross-page) or skips it (aggregate).
      if (page) blocksByPage.set(id, page.blocks)
    })

    return { loaded, blocksByPage, childPageIds }
  }, [isAggregate, isCrossPage, pageId, pagesPending, pageQueries, targetPageIds, childPageIds])
}
