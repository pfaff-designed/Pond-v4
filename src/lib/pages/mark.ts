/**
 * A page's mark — which glyph it shows and in which colour.
 *
 * ONE function owns the whole rule, because several surfaces render the mark (the
 * rail row, the breadcrumb crumb, the children-grid card, the palette) and they
 * must never disagree about the same page.
 *
 * THE RULE:
 *
 *   area   a top-level page that is neither the home row nor the databases
 *          root (a peer of life, not one of its areas). The database holds
 *          the same rule in `public.page_is_area`.
 *
 *   glyph  explicit on the page  →  else automatic: an area's is derived from
 *          its title (`areaGlyph`, so it follows a rename); a page's is none,
 *          and the surface draws its `KindDot`.
 *
 *   colour the area's own role, else ink. A page has no colour of its own: a
 *          role stored on one is ignored, and moving a page to another area
 *          recolours it with no write. Ink means no colour; Pond never
 *          assigns one.
 *
 * Pure — no React, no Supabase, no colour values. A role becomes a colour in
 * exactly one place, `markAccent`.
 */

import { isDatabasesRoot } from '@/lib/pages/databases-root'
import { HOME_TYPE } from '@/lib/pages/home'
import { areaGlyph } from '@/lib/rail/area-glyph'
import { isAreaRole, type AreaRole } from '@/lib/rail/glyph-library'

/** The slice of a page this module needs — satisfied by `PageRow` and `PondPage`. */
export interface MarkSource {
  id: string
  parentId: string | null
  /** The page's type, when the caller has it. Only the home row's matters. */
  type?: string
  title: string
  /** Explicit glyph, or null for the automatic one. */
  glyph?: string | null
  /** The area's colour role. Read only when this page is an area. */
  areaRole?: string | null
}

export interface PageMark {
  /** The glyph to render, or null when the surface should show its KindDot. */
  glyph: string | null
  /** The role of the page's area, or null for ink. */
  role: AreaRole | null
  /** True for an area — the only kind of page that takes a colour. */
  isArea: boolean
  /** True when the page carries its own glyph rather than the automatic one. */
  glyphIsOwn: boolean
}

const NO_MARK: PageMark = { glyph: null, role: null, isArea: false, glyphIsOwn: false }

/** Is this page an area — the only kind that takes a colour? */
export const isArea = (page: Pick<MarkSource, 'parentId' | 'type' | 'title'>): boolean =>
  page.parentId === null && page.type !== HOME_TYPE && !isDatabasesRoot(page)

/**
 * The area `page` sits in — itself when it is one — or undefined when its chain
 * ends anywhere but an area (the databases subtree, the home row, or a parent
 * the index does not hold). `seen` guards a malformed parent cycle.
 */
const areaOf = (
  page: MarkSource,
  byId: ReadonlyMap<string, MarkSource>
): MarkSource | undefined => {
  const seen = new Set<string>()
  let cursor: MarkSource | undefined = page
  while (cursor && cursor.parentId !== null && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    cursor = byId.get(cursor.parentId)
  }
  return cursor && isArea(cursor) ? cursor : undefined
}

/**
 * Resolve the mark for `pageId` against the pond's pages.
 *
 * `byId` is every page the caller knows about — in practice the `['pages', pond]`
 * cache the rail, breadcrumb and page surface already share, so no surface
 * fetches anything new to draw a mark.
 *
 * `fallback` is the page itself, for a caller that holds it but whose map does
 * not: `fetchPages` excludes HOME_TYPE and ROW_TYPE rows from the shared cache,
 * and a presentational render (Storybook, a unit test) has a tree but no pond.
 * An unknown page with no fallback is ink with no glyph, never a blank row.
 */
export const resolveMark = (
  pageId: string,
  byId: ReadonlyMap<string, MarkSource>,
  fallback?: MarkSource
): PageMark => {
  const page = byId.get(pageId) ?? fallback
  if (!page) return NO_MARK

  const pageIsArea = isArea(page)
  const ownGlyph = typeof page.glyph === 'string' && page.glyph.length > 0 ? page.glyph : null
  const areaRole = areaOf(page, byId)?.areaRole

  return {
    glyph: ownGlyph ?? (pageIsArea ? areaGlyph(page.title) : null),
    role: isAreaRole(areaRole) ? areaRole : null,
    isArea: pageIsArea,
    glyphIsOwn: ownGlyph !== null,
  }
}

/** Build the lookup `resolveMark` takes from raw `pages` rows. */
export const markIndex = (
  rows: readonly {
    id: string
    parent_id: string | null
    type?: string
    title: string
    glyph?: string | null
    area_role?: string | null
  }[]
): Map<string, MarkSource> =>
  new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        parentId: r.parent_id,
        type: r.type,
        title: r.title,
        glyph: r.glyph ?? null,
        areaRole: r.area_role ?? null,
      },
    ])
  )
