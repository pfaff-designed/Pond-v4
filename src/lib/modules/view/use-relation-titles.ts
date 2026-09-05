'use client'

/**
 * Client title-resolution seam for a relation value (#20 slice 5). Turns the
 * linked page-ids into a partial id→title map — an id that resolves to nothing is
 * OMITTED (the caller renders it as a faded missing chip) — and supplies the
 * picker's candidates. Both reads reuse caches the rest of the app already primes
 * and invalidates, so titles stay live with no extra wiring.
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
import { createClient } from '@/lib/supabase/client'
import { getCollectionRows, getPage, listPages, type PondPage } from '@/lib/pages/client'
import { useWorkspace } from '@/lib/workspace/context'
import { ROW_TYPE } from '@/lib/properties/schema'

export interface RelationCandidate {
  id: string
  title: string
}

export interface RelationTitles {
  /** id→title for the resolvable linked ids (partial; unresolved omitted). */
  titles: Map<string, string>
  /** The pages the picker offers (target rows, or the global list). */
  candidates: RelationCandidate[]
}

export function useRelationTitles(ids: string[], targetId?: string): RelationTitles {
  const workspace = useWorkspace()
  const supabase = useMemo(() => createClient(), [])
  const targeted = !!targetId

  // Targeted: the collection's rows (shared with the picker + inline views).
  const { data: rows } = useQuery({
    queryKey: targetId ? (['rows', targetId] as const) : (['rows', 'none'] as const),
    queryFn: async () => {
      if (!targetId) return [] as PondPage[]
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return [] as PondPage[]
      return getCollectionRows(supabase, user.id, targetId, workspace)
    },
    enabled: targeted,
  })

  // Untargeted: the whole workspace page list, for a global "link any page" search.
  const { data: allPages } = useQuery({
    queryKey: ['pages', workspace, 'full'] as const,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user ? listPages(supabase, user.id, workspace) : []
    },
    enabled: !targeted,
  })

  // Untargeted: per-id title resolution via each page's own cache.
  const pageQueries = useQueries({
    queries: (targeted ? [] : ids).map((id) => ({
      queryKey: ['page', id] as const,
      queryFn: () => getPage(supabase, id),
    })),
  })

  return useMemo<RelationTitles>(() => {
    const titles = new Map<string, string>()

    if (targeted) {
      const rowList = rows ?? []
      for (const r of rowList) titles.set(r.id, r.title)
      return {
        titles,
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
    return { titles, candidates }
    // pageQueries is a new array each render; the linked ids + resolved data drive it.
  }, [targeted, rows, allPages, ids, pageQueries])
}
