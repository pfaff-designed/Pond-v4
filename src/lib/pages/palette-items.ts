/**
 * What the shell hands the ⌘K palette (#279) — pure over the flat `['pages']`
 * rows, so the list is unit-testable without React or Supabase, and so every
 * value on a row comes from the owner that already derives it:
 *
 *   area    the top-level ancestor, through `ancestorPath` (the breadcrumb's)
 *   kind    `database` under the databases root, through `crumbTrail`
 *   glyph   `resolveMark` — the rail, breadcrumb and card already agree on it
 *   path    the ancestor ids, so the palette's scope keeps what sits under a page
 *
 * Records (`row` pages) never enter the `['pages']` cache, so they are not here:
 * `palette-records.ts` searches them per query. Ponds are not pages either —
 * `pondItems` below. `recentIds` are newest first — `Pond 02` 2g: "the last three
 * pages".
 *
 * The one `byId` index built here is threaded through `ancestorPath` and
 * `crumbTrail`, so the list is linear in page count (AUDIT G7, volume).
 */

import type { PaletteItem, PaletteScope } from '@/components/molecules/palette-entries'
import { ancestorPath, crumbTrail } from '@/lib/pages/crumbs'
import { markIndex, resolveMark } from '@/lib/pages/mark'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'

/** The shell's two standing actions, in Pond's words; `action` is the job the host reads. */
export const NEW_PAGE_ACTION: PaletteItem = {
  id: 'action:new-page',
  label: 'new page',
  kind: 'action',
  action: 'new-page',
}
export const ASK_POND_ACTION: PaletteItem = {
  id: 'action:ask-pond',
  label: 'ask pond',
  kind: 'action',
  action: 'ask-pond',
}

/**
 * Board `6i` frame 3: "Saving is a page action, so it lives in the command
 * palette, not the / menu." A page action, so it lists only when there is a page
 * to save — `paletteItems` appends it on `openPageId` alone.
 *
 * The board draws a second row beside it, `save a copy as a page`. That is its
 * own action and is not built (KAN-10 covers the template half only).
 */
export const SAVE_AS_TEMPLATE_ACTION: PaletteItem = {
  id: 'action:save-as-template',
  label: 'save page as template',
  kind: 'action',
  action: 'save-as-template',
}

export function paletteItems(
  rows: readonly PageRow[],
  recentIds: readonly string[],
  /**
   * The page open right now, if any. Page actions list only when there is a page
   * for them to act on (board `6i` frame 3).
   */
  openPageId?: string | null
): PaletteItem[] {
  const all = [...rows]
  const index = markIndex(all)
  const byId = new Map(all.map((r) => [r.id, r]))
  const item = (r: PageRow): PaletteItem => {
    const path = ancestorPath(all, r.id, byId)
    const { root } = crumbTrail(all, r.id, byId)
    return {
      id: r.id,
      label: r.title || 'Untitled',
      kind: root && root.id !== r.id ? 'database' : 'page',
      sub: path[0]?.title,
      glyph: resolveMark(r.id, index).glyph ?? undefined,
      path: path.map((c) => c.id),
    }
  }
  const recent = recentIds.flatMap((id) => byId.get(id) ?? [])
  const recentSet = new Set(recent.map((r) => r.id))
  return [
    ...recent.map((r) => ({ ...item(r), recent: true })),
    ...all.filter((r) => !recentSet.has(r.id)).map(item),
    NEW_PAGE_ACTION,
    ASK_POND_ACTION,
    ...(openPageId ? [SAVE_AS_TEMPLATE_ACTION] : []),
  ]
}

/**
 * The other ponds, as `pond` rows — `PondPicker`'s `ponds` state: the pond's own
 * glyph and `pond · switch` beneath its name. The pond in view is left out (there is
 * nothing to switch to), and no `⌘n` hint rides on a row: those keys collide with
 * the browser's tab switching (AUDIT K1). The id is the pond's own, so the host
 * navigates with `pondHref(item.id)`.
 */
export const pondItems = (ponds: readonly Pond[], activeId: string | null): PaletteItem[] =>
  ponds
    .filter((p) => p.id !== activeId)
    .map((p) => ({
      id: p.id,
      label: p.name,
      kind: 'pond',
      sub: 'pond · switch',
      glyph: p.glyph ?? LIFE_GLYPH,
    }))

/**
 * Where `new page` files: the page in view, else the pond's root. ONE value,
 * read twice — the palette's `new page “q” under <title>` row names `title` and
 * the New page dialog opens on `id` — so the two can never disagree (the #239
 * shape: a condition derived in two layers with nothing connecting them). The
 * palette's scope is not this: a scope is palette state that ⌫ clears, and it
 * is `null` on a leaf, while the destination stays the page in view.
 *
 * A `currentId` the rows do not hold yet (the tree still loading) keeps the id —
 * the dialog's standing default — and the one title we have for it.
 */
export function newPageParent(
  rows: readonly PageRow[],
  currentId: string | null,
  pondName: string
): { id: string | null; title: string } {
  if (!currentId) return { id: null, title: pondName }
  const page = rows.find((r) => r.id === currentId)
  return { id: currentId, title: page?.title || 'Untitled' }
}

/**
 * `Pond 02` 2g: "opening ⌘K with a page selected in the rail scopes it to that
 * page and its children" — so a page with children scopes; a leaf has nothing
 * under it to scope to and the palette opens whole.
 */
export function paletteScope(
  rows: readonly PageRow[],
  selectedId: string | null
): PaletteScope | null {
  if (!selectedId) return null
  const page = rows.find((r) => r.id === selectedId)
  if (!page || !rows.some((r) => r.parent_id === selectedId)) return null
  return { id: page.id, label: page.title || 'Untitled' }
}
