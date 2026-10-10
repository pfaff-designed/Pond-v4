/**
 * The flat page rows behind the ['pages'] tree — shared by the rail and the
 * page surface so both read (and invalidate) the same React Query cache.
 *
 * The Life home row (ticket-44, `type='home'`) is stripped here — this is the ONE
 * boundary where it's excluded, so every UI-tree consumer (rail, children-grid
 * cards, breadcrumb) never sees it: it can't become a rail child or one of Life's
 * own cards. Its blocks are reached only via lib/pages/home.ts.
 */

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { inPond, resolvePond } from '@/lib/pond/scope'
import { pagesKey } from './keys'
import { HOME_TYPE } from '@/lib/pages/home'
import { ROW_TYPE } from '@/lib/properties/schema'

export interface PageRow {
  id: string
  parent_id: string | null
  type: string
  title: string
  order: number
  updated_at: string
  /**
   * #134: the page's own mark. OPTIONAL rather than `| null` because a row
   * synthesised in code (the Life home row) or a fixture testing rail ordering
   * has no business carrying mark columns — and `markIndex` already reads an
   * absent field as "derive", the same answer as null. `fetchPages` always
   * selects both.
   */
  glyph?: string | null
  area_role?: string | null
}

export async function fetchPages(pondId?: string | null): Promise<PageRow[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // #312: a pond is an instance of the shell, so the tree it shows is its own.
  // When the caller does not name a pond — a surface rendered outside the shell's
  // PondProvider — fall back to the person's first, which is also what `?pond=`
  // resolves to on a cold load. Never return every pond's pages: that is how a
  // new pond would show the first pond's tree.
  const scope = await resolvePond(supabase, user.id, pondId)

  const q = supabase
    .from('pages')
    // #134: glyph + area_role ride along, so the ONE pagesKey() cache
    // the rail, breadcrumb and page surface already share is enough to resolve every
    // mark — no surface fetches anything extra to draw one.
    .select('id, parent_id, type, title, "order", updated_at, glyph, area_role')
    .eq('user_id', user.id)
    // #312: scoped by POND, not by workspace. The sandbox pond holds exactly the
    // `workspace='sandbox'` rows, so the pond filter already says everything the
    // workspace filter said — and keeping BOTH made the sandbox pond unreachable:
    // `/workspace?pond=<sandbox>` asked for `workspace='main'` AND the sandbox
    // pond, which can never both match, so it showed nothing. `workspace` is now
    // dead weight on the column; retiring it is its own slice.
    // ticket-44: the reserved Life home row never enters the ['pages'] cache
    // (rail / children grid / breadcrumb) — home blocks are read separately.
    .neq('type', HOME_TYPE)
    // #18: a collection's schema-bound `row` children are surfaced only through
    // views, never as rail children or children-grid cards — this is the ONE boundary
    // that keeps them out of the tree. They stay directly openable via getPage.
    .neq('type', ROW_TYPE)

  // Filters before `.order()`: a PostgREST builder is chainable either way, but
  // ordering last keeps the shape readable and means a test double does not have
  // to return a chainable from `order`.
  const { data, error } = await inPond(q, scope).order('order')
  if (error) throw error
  return (data ?? []) as PageRow[]
}

/**
 * Optimistically insert a just-created page into the pagesKey() cache so
 * the rail sees it synchronously — before the navigate — instead of waiting on the
 * invalidate refetch. Fixes F26 (a new page shows at ROOT until a manual refresh):
 * the rail's reveal effect bailed because the new node wasn't in the stale cache
 * yet, and its once-per-selection guard then blocked a retry when the refetch
 * landed. Idempotent (dedupes by id); the subsequent invalidate reconciles the
 * placeholder `order`/`updated_at` with server truth.
 */
export function insertPageOptimistic(
  queryClient: QueryClient,
  page: { id: string; parentId: string | null; type: string; title: string },
  /**
   * #312: the pond whose cache to write. `setQueryData` is an EXACT key match,
   * unlike `invalidateQueries`, so writing `pagesKey()` while the reads
   * moved to `pagesKey(pondId)` silently did nothing — which killed the
   * synchronous reveal, the drag rollback, and the delete-undo window.
   */
  pondId: string | null
): void {
  queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) => {
    const existing = rows ?? []
    if (existing.some((r) => r.id === page.id)) return existing
    return [
      ...existing,
      {
        id: page.id,
        parent_id: page.parentId,
        type: page.type,
        title: page.title,
        order: 0,
        updated_at: new Date().toISOString(),
      },
    ]
  })
}

/**
 * Optimistically retitle ONE row in the pagesKey() cache so the rail shows the
 * name before `updateTitle`'s write lands. Touches only that row, so rolling back
 * is the same call with the previous title — it cannot clobber a move or add that
 * landed in between.
 */
export function applyRenameOptimistic(
  queryClient: QueryClient,
  rename: { id: string; title: string },
  pondId: string | null
): void {
  queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) =>
    rows?.map((r) => (r.id === rename.id ? { ...r, title: rename.title } : r))
  )
}

/**
 * Optimistically apply a MOVE (F25) to the pagesKey() cache so the rail
 * restructures instantly — before movePage's write lands. Sets the moved row's
 * `parent_id` and rewrites `order = index` for every id in the reindexed target
 * group (computeMove's `siblingOrder`). Mirrors insertPageOptimistic; returns the
 * pre-move rows so the caller can roll back if the persistence call fails. A
 * subsequent invalidate reconciles with server truth.
 */
export function applyMoveOptimistic(
  queryClient: QueryClient,
  move: { movedId: string; newParentId: string | null; siblingOrder: string[] },
  /**
   * #312: the pond whose cache to write. `setQueryData` is an EXACT key match,
   * unlike `invalidateQueries`, so writing `pagesKey()` while the reads
   * moved to `pagesKey(pondId)` silently did nothing — which killed the
   * synchronous reveal, the drag rollback, and the delete-undo window.
   */
  pondId: string | null
): PageRow[] | undefined {
  const key = pagesKey(pondId)
  const snapshot = queryClient.getQueryData<PageRow[]>(key)
  const orderById = new Map(move.siblingOrder.map((id, index) => [id, index]))
  queryClient.setQueryData<PageRow[]>(key, (rows) => {
    if (!rows) return rows
    return rows.map((r) => {
      const parent_id = r.id === move.movedId ? move.newParentId : r.parent_id
      const order = orderById.has(r.id) ? orderById.get(r.id)! : r.order
      if (parent_id === r.parent_id && order === r.order) return r
      // A top-level page nested under another stops being an area, and the
      // database clears its role in the same write.
      const nested = r.parent_id === null && parent_id !== null
      return nested ? { ...r, parent_id, order, area_role: null } : { ...r, parent_id, order }
    })
  })
  return snapshot
}
