'use client'

/**
 * Client title-resolution seam for a relation value (#20 slice 5). Resolves
 * each linked page-id to one of three states: live (in `titles`), trashed (its
 * delete-record snapshot title, in `trashedTitles`), or neither — the caller
 * renders that id as a faded missing chip. Also supplies the picker's
 * candidates. Both reads reuse caches the rest of the app already primes
 * and invalidates, so titles stay live with no extra wiring.
 *
 *   - A page trashed as a descendant of a trashed parent has no delete record
 *     of its own, so its id lands in neither map and falls back to missing
 *     (deferred, not fixed here).
 *
 *   - Targeted (a relation with a `target` collection): reuse the shared
 *     `['rows', targetId]` cache — the same rows the picker links into. Titles come
 *     from those rows; an off-target stored id (tolerated, #20 leniency) is simply
 *     absent → missing.
 *   - Untargeted ("link any page"): resolve each id via its own `['page', id]`
 *     cache (the editor's cache, so edits keep titles fresh), and offer the whole
 *     workspace page list (minus rows) as candidates for a global title search.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getCollectionRows, getPage, listPages, type PondPage } from '@/lib/pages/client'
import { usePondId } from '@/lib/pond/context'
import { ROW_TYPE } from '@/lib/properties/schema'
import { pagesKey } from '@/lib/pages/keys'
import { existingPageIds } from '@/lib/change-log/trash'
import { listRecords } from '@/lib/change-log/store'
import { readTrashSnapshot } from '@/lib/change-log/summary'

export interface RelationCandidate {
  id: string
  title: string
}

export interface RelationTitles {
  /** id→title for the resolvable (live) linked ids (partial; unresolved omitted). */
  titles: Map<string, string>
  /** id→title for a linked id that resolves to no live title but still exists in
   *  the trash — read off its newest `delete` record's snapshot. An id that is
   *  gone outright (purged, or never existed) is in neither map. */
  trashedTitles: Map<string, string>
  /** The pages the picker offers (target rows, or the global list). */
  candidates: RelationCandidate[]
}

export function useRelationTitles(ids: string[], targetId?: string): RelationTitles {
  const pondId = usePondId()
  // Lazily created on first fetch, not at render — so seeded/disabled queries
  // (e.g. Storybook, envless CI) never construct a real client and throw.
  const getSupabase = useLazySupabase()
  const targeted = !!targetId

  // Targeted: the collection's rows (shared with the picker + inline views).
  const { data: rows, isPending: rowsPending } = useQuery({
    queryKey: targetId ? (['rows', targetId] as const) : (['rows', 'none'] as const),
    queryFn: async () => {
      if (!targetId) return [] as PondPage[]
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return [] as PondPage[]
      return getCollectionRows(supabase, user.id, targetId)
    },
    enabled: targeted,
  })

  // Untargeted: the whole workspace page list, for a global "link any page" search.
  const { data: allPages } = useQuery({
    queryKey: [...pagesKey(pondId), 'full'] as const,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? listPages(supabase, user.id, pondId) : []
    },
    enabled: !targeted,
  })

  // Untargeted: per-id title resolution via each page's own cache.
  const pageQueries = useQueries({
    queries: (targeted ? [] : ids).map((id) => ({
      queryKey: ['page', id] as const,
      queryFn: () => getPage(getSupabase(), id),
    })),
  })

  // Ids with no live title from whichever branch applies — the only ones worth
  // checking against the trash (a live title never needs it). An id whose live
  // source hasn't settled yet is left out, not treated as unresolved — otherwise
  // every id fires a trash lookup on first mount, live ones included.
  const unresolvedIds = useMemo(() => {
    if (targeted) {
      if (rowsPending) return []
      const live = new Set((rows ?? []).map((r) => r.id))
      return ids.filter((id) => !live.has(id))
    }
    return ids.filter((id, i) => !pageQueries[i]?.isPending && !pageQueries[i]?.data)
  }, [targeted, rows, rowsPending, ids, pageQueries])

  // A trashed id's title comes off the newest `delete` record's snapshot
  // (`existingPageIds` tells it apart from an id that's gone outright).
  const trashedTitleQueries = useQueries({
    queries: unresolvedIds.map((id) => ({
      queryKey: ['page', id, 'trashed-title'] as const,
      queryFn: async () => {
        const supabase = getSupabase()
        const existing = await existingPageIds(supabase, [id])
        if (!existing.has(id)) return null
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return null
        const records = await listRecords(supabase, {
          userId: user.id,
          pondId,
          action: 'delete',
          targetPageId: id,
          limit: 1,
        })
        return readTrashSnapshot(records[0]?.before)?.title ?? null
      },
    })),
  })

  return useMemo<RelationTitles>(() => {
    const titles = new Map<string, string>()
    const trashedTitles = new Map<string, string>()
    unresolvedIds.forEach((id, i) => {
      const title = trashedTitleQueries[i]?.data
      if (title) trashedTitles.set(id, title)
    })

    if (targeted) {
      const rowList = rows ?? []
      for (const r of rowList) titles.set(r.id, r.title)
      return {
        titles,
        trashedTitles,
        candidates: rowList.map((r) => ({ id: r.id, title: r.title })),
      }
    }

    const idList = ids
    idList.forEach((id, i) => {
      const p = pageQueries[i]?.data
      if (p) titles.set(id, p.title)
    })
    const candidates = (allPages ?? [])
      .filter((p) => p.type !== ROW_TYPE)
      .map((p) => ({ id: p.id, title: p.title }))
    return { titles, trashedTitles, candidates }
    // pageQueries/trashedTitleQueries are new arrays each render; the linked
    // ids + resolved data drive them.
  }, [targeted, rows, allPages, ids, pageQueries, unresolvedIds, trashedTitleQueries])
}
