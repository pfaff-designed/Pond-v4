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
 * Records (`row` pages) never enter the `['pages']` cache, so the palette lists
 * none live yet; the `record` kind renders and is fed when a records source
 * exists. `recentIds` are newest first — `Pond 02` 2g: "the last three pages".
 */

import type { PaletteItem, PaletteScope } from '@/components/molecules/palette-entries'
import { ancestorPath, crumbTrail } from '@/lib/pages/crumbs'
import { markIndex, resolveMark } from '@/lib/pages/mark'
import type { PageRow } from '@/lib/pages/tree'

/** The shell's two standing actions, in Pond's words. */
export const NEW_PAGE_ACTION: PaletteItem = {
  id: 'action:new-page',
  label: 'new page',
  kind: 'action',
}
export const ASK_POND_ACTION: PaletteItem = {
  id: 'action:ask-pond',
  label: 'ask pond',
  kind: 'action',
}

export function paletteItems(
  rows: readonly PageRow[],
  recentIds: readonly string[]
): PaletteItem[] {
  const all = [...rows]
  const index = markIndex(all)
  const byId = new Map(all.map((r) => [r.id, r]))
  const item = (r: PageRow): PaletteItem => {
    const path = ancestorPath(all, r.id)
    const { root } = crumbTrail(all, r.id)
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
  ]
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
