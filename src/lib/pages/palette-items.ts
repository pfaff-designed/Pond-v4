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
import { subtreeIdsFromRows } from '@/lib/deletion/blast-radius'
import { ancestorPath, crumbTrail } from '@/lib/pages/crumbs'
import { isDuplicablePageRow, isMovablePageRow } from '@/lib/pages/databases-root'
import { markIndex, type MarkSource, resolveMark } from '@/lib/pages/mark'
import { RECENT_SHOWN } from '@/lib/pages/recent-pages'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'
import { LIFE_ID } from '@/lib/rail/tree'
import { formatChord } from '@/lib/shell-commands'

/**
 * One page row as a palette row — the shared fact behind both the full list
 * (`paletteItems`) and the move picker's candidate list (`movePickItems`), so
 * a page's kind/sub/glyph/path is computed once, not twice (AGENTS.md DRY).
 */
function pageRowItem(
  rows: PageRow[],
  byId: Map<string, PageRow>,
  index: Map<string, MarkSource>,
  r: PageRow
): PaletteItem {
  const path = ancestorPath(rows, r.id, byId)
  const { root } = crumbTrail(rows, r.id, byId)
  return {
    id: r.id,
    label: r.title || 'Untitled',
    kind: root && root.id !== r.id ? 'database' : 'page',
    sub: path[0]?.title,
    glyph: resolveMark(r.id, index).glyph ?? undefined,
    path: path.map((c) => c.id),
  }
}

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

/** 6r frame 1's other door into the mode: "or ⌘K — deep research from the palette." */
export const DEEP_RESEARCH_ACTION: PaletteItem = {
  id: 'action:deep-research',
  label: 'deep research',
  kind: 'action',
  action: 'deep-research',
}

/**
 * 6z's fourth door into the composer's html attach — board `Pond 06.25 Import
 * a page.dc.html` frame 1. Stands beside the shell's other two actions
 * unconditionally; the host opens the file chooser filtered to `.html`/`.htm`.
 */
export const IMPORT_A_PAGE_ACTION: PaletteItem = {
  id: 'action:import-a-page',
  label: 'import a page',
  kind: 'action',
  action: 'import-a-page',
}

/**
 * KAN-335: a standing door into filing feedback, beside the shell's other
 * actions unconditionally — there is always a problem to report, unlike the
 * page-scoped `save-as-template`.
 */
export const REPORT_A_PROBLEM_ACTION: PaletteItem = {
  id: 'action:report-a-problem',
  label: 'report a problem',
  kind: 'action',
  action: 'report-a-problem',
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

/**
 * KAN-468: no board draws this — "No board draws it; the app's flow applies"
 * (Notion's page-menu Duplicate, ⌘D). A page action like `save-as-template`
 * just above, so it lists only when there is a page open to duplicate — AND
 * that page passes `isDuplicablePageRow`, the same rule Rail's own ⌘D
 * capability reads, which refuses the pond root and the databases root.
 */
export const DUPLICATE_PAGE_ACTION: PaletteItem = {
  id: 'action:duplicate-page',
  label: 'duplicate page',
  kind: 'action',
  action: 'duplicate-page',
}

/**
 * KAN-469: Notion's page-menu "Move to" (⌘⇧P), moved into the palette rather
 * than an undesigned header menu. A page action like `duplicate page` just
 * above, so it lists under a duplicable open page too — but NOT the same
 * `isDuplicablePageRow` gate: an extra root is duplicable but the rail
 * refuses to drag one (KAN-490/491), so this row reads `isMovablePageRow`
 * instead (duplicable minus an extra root).
 */
export const MOVE_PAGE_ACTION: PaletteItem = {
  id: 'action:move-page',
  label: 'move page to…',
  kind: 'action',
  action: 'move-page',
  key: formatChord('mod+shift+p'),
}

export function paletteItems(
  rows: readonly PageRow[],
  /** Newest first, up to the store's own 20-entry cap — not pre-sliced by the caller. */
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
  const item = (r: PageRow): PaletteItem => pageRowItem(all, byId, index, r)
  // Capped after the existence filter above, so a trashed page in the newest
  // slots doesn't shrink the visible group below RECENT_SHOWN.
  const recent = recentIds.flatMap((id) => byId.get(id) ?? []).slice(0, RECENT_SHOWN)
  const recentSet = new Set(recent.map((r) => r.id))
  // The home page is never in `rows` (fetchPages excludes `type = 'home'`), so
  // a missing lookup is itself a reason not to offer duplicate — the rule
  // defaults closed, not open, on an id it can't resolve.
  const openPage = openPageId ? byId.get(openPageId) : undefined
  return [
    ...recent.map((r) => ({ ...item(r), recent: true })),
    ...all.filter((r) => !recentSet.has(r.id)).map(item),
    IMPORT_A_PAGE_ACTION,
    REPORT_A_PROBLEM_ACTION,
    NEW_PAGE_ACTION,
    { ...ASK_POND_ACTION, key: formatChord('mod+j') },
    DEEP_RESEARCH_ACTION,
    ...(openPageId ? [SAVE_AS_TEMPLATE_ACTION] : []),
    ...(openPage && isDuplicablePageRow(openPage) ? [DUPLICATE_PAGE_ACTION] : []),
    ...(openPage && isMovablePageRow(openPage) ? [MOVE_PAGE_ACTION] : []),
  ]
}

/**
 * `move page to…`'s candidate list: every page/database row except the one
 * moving and its own descendants (a move there is refused by the RPC anyway,
 * so the picker doesn't offer it), plus one synthetic row standing for the
 * pond's root — `computeMove`/`moveParent` already resolve `LIFE_ID` with zone
 * `'into'` to `newParentId: null`, so no new move-resolution logic is needed,
 * only this one extra entry.
 */
export function movePickItems(
  rows: readonly PageRow[],
  movingId: string,
  rootLabel: string
): PaletteItem[] {
  const all = [...rows]
  const excluded = subtreeIdsFromRows(all, movingId)
  const index = markIndex(all)
  const byId = new Map(all.map((r) => [r.id, r]))
  const rootRow: PaletteItem = { id: LIFE_ID, label: rootLabel, kind: 'page' }
  return [
    rootRow,
    ...all.filter((r) => !excluded.has(r.id)).map((r) => pageRowItem(all, byId, index, r)),
  ]
}

/**
 * Zen's rows, under `mode` — `Pond 06.17` 6q frame 1, copied as the board writes
 * them. Zen is a mode of the page in view, and every surface shows one, so they
 * list whenever the palette does. While in zen the one row is the way out (7g:
 * "esc, or ⌘K › leave zen").
 */
export const ZEN_ACTION: PaletteItem = {
  id: 'action:zen',
  label: 'zen',
  kind: 'action',
  action: 'zen',
  sub: 'this page, everything else hidden',
  group: 'mode',
}
export const ZEN_ON_INK_ACTION: PaletteItem = {
  id: 'action:zen-on-ink',
  label: 'zen, on ink',
  kind: 'action',
  action: 'zen-on-ink',
  sub: 'same, on the ink ground',
  group: 'mode',
}
export const LEAVE_ZEN_ACTION: PaletteItem = {
  id: 'action:leave-zen',
  label: 'leave zen',
  kind: 'action',
  action: 'leave-zen',
  group: 'mode',
}

const MODE_IN_ZEN: readonly PaletteItem[] = [LEAVE_ZEN_ACTION]

/** `modeItems(false)`'s cache, so `use-zen-commands.ts`'s render-time call returns the same array while the platform doesn't change. */
let modeOutOfZenKey: string | null = null
let modeOutOfZen: readonly PaletteItem[] | null = null

/**
 * The rail's row, under `mode` beside zen. One row: minimize while the rail is
 * open, show while it is hidden. ⌘\ is the hint on both — the button and the
 * chord call the same store.
 */
let railItemsKey: string | null = null
let railItemsOpen: readonly PaletteItem[] | null = null
let railItemsHidden: readonly PaletteItem[] | null = null

export const railItems = (minimized: boolean): readonly PaletteItem[] => {
  const key = formatChord('mod+\\')
  if (railItemsKey !== key || !railItemsOpen || !railItemsHidden) {
    railItemsKey = key
    railItemsOpen = [
      {
        id: 'action:minimize-rail',
        label: 'minimize rail',
        kind: 'action',
        action: 'minimize-rail',
        group: 'mode',
        key,
      },
    ]
    railItemsHidden = [
      {
        id: 'action:show-rail',
        label: 'show rail',
        kind: 'action',
        action: 'show-rail',
        group: 'mode',
        key,
      },
    ]
  }
  return minimized ? railItemsHidden : railItemsOpen
}

export const modeItems = (inZen: boolean): readonly PaletteItem[] => {
  if (inZen) return MODE_IN_ZEN
  const key = formatChord('mod+.')
  if (modeOutOfZen && modeOutOfZenKey === key) return modeOutOfZen
  modeOutOfZenKey = key
  modeOutOfZen = [{ ...ZEN_ACTION, key }, ZEN_ON_INK_ACTION]
  return modeOutOfZen
}

/**
 * The other ponds, as `pond` rows — `PondPicker`'s `ponds` state: the pond's own
 * glyph and `pond · switch` beneath its name. The pond in view is left out (there is
 * nothing to switch to), and no `⌘n` hint rides on a row: those keys bind only in a
 * desktop app, because the browser keeps them for tab switching (AUDIT K1, decided
 * 8 oct). The id is the pond's own, so the host
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
