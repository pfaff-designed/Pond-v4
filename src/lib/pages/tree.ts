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
import type { WorkspaceScope } from '@/lib/workspace/context'
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

export async function fetchPages(workspace: WorkspaceScope = 'main'): Promise<PageRow[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('pages')
    // #134: glyph + area_role ride along, so the ONE ['pages', workspace] cache
    // the rail, breadcrumb and page surface already share is enough to resolve every
    // mark — no surface fetches anything extra to draw one.
    .select('id, parent_id, type, title, "order", updated_at, glyph, area_role')
    .eq('user_id', user.id)
    .eq('workspace', workspace)
    // ticket-44: the reserved Life home row never enters the ['pages'] cache
    // (rail / children grid / breadcrumb) — home blocks are read separately.
    .neq('type', HOME_TYPE)
    // #18: a collection's schema-bound `row` children are surfaced only through
    // views, never as rail children or children-grid cards — this is the ONE boundary
    // that keeps them out of the tree. They stay directly openable via getPage.
    .neq('type', ROW_TYPE)
    .order('order')

  if (error) throw error
  return (data ?? []) as PageRow[]
}

/**
 * Optimistically insert a just-created page into the ['pages', workspace] cache so
 * the rail sees it synchronously — before the navigate — instead of waiting on the
 * invalidate refetch. Fixes F26 (a new page shows at ROOT until a manual refresh):
 * the rail's reveal effect bailed because the new node wasn't in the stale cache
 * yet, and its once-per-selection guard then blocked a retry when the refetch
 * landed. Idempotent (dedupes by id); the subsequent invalidate reconciles the
 * placeholder `order`/`updated_at` with server truth.
 */
export function insertPageOptimistic(
  queryClient: QueryClient,
  workspace: WorkspaceScope,
  page: { id: string; parentId: string | null; type: string; title: string }
): void {
  queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) => {
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
 * Optimistically apply a MOVE (F25) to the ['pages', workspace] cache so the rail
 * restructures instantly — before movePage's write lands. Sets the moved row's
 * `parent_id` and rewrites `order = index` for every id in the reindexed target
 * group (computeMove's `siblingOrder`). Mirrors insertPageOptimistic; returns the
 * pre-move rows so the caller can roll back if the persistence call fails. A
 * subsequent invalidate reconciles with server truth.
 */
export function applyMoveOptimistic(
  queryClient: QueryClient,
  workspace: WorkspaceScope,
  move: { movedId: string; newParentId: string | null; siblingOrder: string[] }
): PageRow[] | undefined {
  const snapshot = queryClient.getQueryData<PageRow[]>(['pages', workspace])
  const orderById = new Map(move.siblingOrder.map((id, index) => [id, index]))
  queryClient.setQueryData<PageRow[]>(['pages', workspace], (rows) => {
    if (!rows) return rows
    return rows.map((r) => {
      const parent_id = r.id === move.movedId ? move.newParentId : r.parent_id
      const order = orderById.has(r.id) ? orderById.get(r.id)! : r.order
      return parent_id === r.parent_id && order === r.order ? r : { ...r, parent_id, order }
    })
  })
  return snapshot
}
