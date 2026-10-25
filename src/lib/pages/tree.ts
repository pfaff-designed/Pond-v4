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
import type { AreaRole } from '@/lib/rail/glyph-library'
import { changeLogKey } from '@/lib/change-log/keys'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { readDuplicatePageSnapshot } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

export interface PageRow {
  id: string
  parent_id: string | null
  type: string
  title: string
  order: number
  updated_at: string
  /**
   * KAN-536: the real insert time, for `pickTasksDatabase`'s oldest-wins
   * tie-break only — every other reader of `PageRow` keeps using
   * `updated_at`. Optional because it predates every fixture/mock that
   * builds a `PageRow` by hand; absent falls back to `updated_at` at the
   * one call site that reads it.
   */
  created_at?: string
  /**
   * #134: the page's own mark. OPTIONAL rather than `| null` because a row
   * synthesised in code (the Life home row) or a fixture testing rail ordering
   * has no business carrying mark columns — and `markIndex` already reads an
   * absent field as "derive", the same answer as null. `fetchPages` always
   * selects both.
   */
  glyph?: string | null
  area_role?: string | null
  /**
   * KAN-122: rides along the same way `glyph`/`area_role` do, so
   * `isNewNestedPage`/the `new` chip and row note derive from the one
   * `['pages', pond]` cache without a second fetch. Stays small (write-once
   * stamp keys only) — never the full props blob a page surface needs.
   */
  props?: Record<string, unknown> | null
}

export async function fetchPages(pondId: string | null): Promise<PageRow[]> {
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
  const pond = await resolvePond(supabase, user.id, pondId)

  const q = supabase
    .from('pages')
    // #134: glyph + area_role ride along, so the ONE pagesKey() cache
    // the rail, breadcrumb and page surface already share is enough to resolve every
    // mark — no surface fetches anything extra to draw one.
    // KAN-122: props rides along too (small write-once stamps only), so the same
    // cache resolves isNewNestedPage per row with no second fetch.
    .select('id, parent_id, type, title, "order", updated_at, created_at, glyph, area_role, props')
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
  const { data, error } = await inPond(q, pond).order('order')
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
  page: {
    id: string
    parentId: string | null
    type: string
    title: string
    /**
     * KAN-122: a `/ nested page` row's created page carries `nestedFrom`/`kind`
     * (and later `openedAt`) at creation. Passed through so `isNewNestedPage` is
     * true on the optimistic row itself — the rail note and the link row's `new`
     * chip show at once, not after the invalidate's refetch lands.
     */
    props?: Record<string, unknown> | null
  },
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
        ...(page.props ? { props: page.props } : {}),
      },
    ]
  })
}

/**
 * KAN-468: the one place both duplicate entry points (⌘K and ⌘D) land after
 * `duplicatePage` resolves — invalidates the pages tree so the copy shows in
 * the rail, remembers the step for ⌘Z, invalidates the change log, and (KAN-468
 * follow-up) invalidates the link parent's own `['page', id]` key when the RPC
 * appended a page-link block to it, so that page's open draft redraws with the
 * new link instead of missing it until an unrelated refetch. Kept here rather
 * than in `client.ts` since it only touches the query cache/undo stack, never
 * the RPC; kept here rather than in `duplicate.ts` since `duplicateAndOpen`
 * (the RPC-calling flow) is the one caller, not the one doing cache work.
 */
export function afterDuplicate(
  queryClient: QueryClient,
  record: ChangeLogRecord,
  pondId: string | null
): void {
  void queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
  if (pondId) sessionUndo.remember({ pondId, recordIds: [record.id] })
  void queryClient.invalidateQueries({ queryKey: changeLogKey() })
  const linkParentId = readDuplicatePageSnapshot(record.after)?.linkParentId
  if (linkParentId) void queryClient.invalidateQueries({ queryKey: ['page', linkParentId] })
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
 * Optimistically set ONE row's glyph (KAN-248 6/8) in the pagesKey() cache —
 * null restores the automatic mark — so the rail redraws through `resolveMark`
 * before `setPageGlyph`'s write lands. Mirrors `applyRenameOptimistic`: touches
 * only the picked row, so rolling back is the same call with the previous glyph.
 */
export function applyGlyphOptimistic(
  queryClient: QueryClient,
  pick: { id: string; glyph: string | null },
  pondId: string | null
): void {
  queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) =>
    rows?.map((r) => (r.id === pick.id ? { ...r, glyph: pick.glyph } : r))
  )
}

/**
 * Optimistically set ONE area's colour (KAN-249 1/7) in the pagesKey() cache —
 * null restores ink — so the rail and breadcrumb redraw through resolveMark
 * before setAreaRole's write lands. Mirrors applyGlyphOptimistic: touches only
 * the picked row, so rolling back is the same call with the previous role.
 */
export function applyAreaRoleOptimistic(
  queryClient: QueryClient,
  pick: { id: string; role: AreaRole | null },
  pondId: string | null
): void {
  queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) =>
    rows?.map((r) => (r.id === pick.id ? { ...r, area_role: pick.role } : r))
  )
}

/**
 * Optimistically merge props onto ONE row in the pagesKey() cache (KAN-122) —
 * so a write-once stamp (e.g. `markOpened`'s `openedAt`) is reflected immediately,
 * before its own write lands, and the `new` chip/row note disappear without
 * waiting on a refetch. Mirrors `applyGlyphOptimistic`: touches only the picked
 * row, merging onto whatever `props` it already carries rather than replacing it.
 */
export function applyPagePropsOptimistic(
  queryClient: QueryClient,
  patch: { id: string; props: Record<string, unknown> },
  pondId: string | null
): void {
  queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (rows) =>
    rows?.map((r) => (r.id === patch.id ? { ...r, props: { ...r.props, ...patch.props } } : r))
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
  move: {
    movedId: string
    newParentId: string | null
    siblingOrder: string[]
    /** KAN-470: a destination-clash suffix, written in this same optimistic pass so the rail never flashes the old, clashing title. */
    newTitle?: string
  },
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
      const title = r.id === move.movedId && move.newTitle !== undefined ? move.newTitle : r.title
      if (parent_id === r.parent_id && order === r.order && title === r.title) return r
      // A top-level page nested under another stops being an area, and the
      // database clears its role in the same write.
      const nested = r.parent_id === null && parent_id !== null
      return nested
        ? { ...r, parent_id, order, title, area_role: null }
        : { ...r, parent_id, order, title }
    })
  })
  return snapshot
}
