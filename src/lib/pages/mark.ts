/**
 * A page's mark — which glyph it shows and in which colour (issue #134).
 *
 * ONE function owns the whole rule, because several surfaces render the mark (the
 * rail row, the breadcrumb crumb, the children-grid card) and they must never
 * disagree about the same page.
 *
 * THE RULE, in order:
 *
 *   glyph  explicit on the page  →  else derived from its title (#91's
 *          `areaGlyph`, which only knows the six seeded areas)  →  else none,
 *          and the surface falls back to its `KindDot`.
 *
 *   colour explicit role on the page  →  else the nearest ANCESTOR with an
 *          explicit role  →  else none: the mark is ink. "Ink is the default
 *          (no colour)" (PROJECT_RULES) — a colour is only ever one the person
 *          chose, never one assigned to them.
 *
 * The inheritance walk is what keeps "a whole area reads as one hue" true once
 * someone has coloured it: a child with no role of its own takes its area's, and
 * an explicit role on the child is a deliberate exception. Null is the answer for
 * every page that has never been touched, so the migration needs no backfill.
 *
 * Pure — no React, no Supabase, no colour values. A role becomes a colour in
 * exactly one place, `markAccent`.
 */

import { areaGlyph } from '@/lib/rail/area-glyph'
import { isAreaRole, type AreaRole } from '@/lib/rail/glyph-library'

/** The slice of a page this module needs — satisfied by `PageRow` and `PondPage`. */
export interface MarkSource {
  id: string
  parentId: string | null
  title: string
  /** Explicit glyph, or null to derive from the title. */
  glyph?: string | null
  /** Explicit area role, or null to inherit. */
  areaRole?: string | null
}

export interface PageMark {
  /** The glyph to render, or null when the surface should show its KindDot. */
  glyph: string | null
  /** The area role to tint with, or null for ink (nobody chose a colour). */
  role: AreaRole | null
  /** True when this page carries its own role rather than inheriting one. */
  roleIsOwn: boolean
  /** True when this page carries its own glyph rather than deriving from its title. */
  glyphIsOwn: boolean
}

/**
 * Resolve the mark for `pageId` against the pond's pages.
 *
 * `byId` is every page the caller knows about — in practice the `['pages',
 * workspace]` cache the rail, breadcrumb and page surface already share, so no
 * surface fetches anything new to draw a mark.
 *
 * An unknown `pageId` with no `fallback` still returns a mark — ink and no
 * glyph — because a missing page must not blank a row. A caller that
 * HOLDS the page should pass it as `fallback`; see the note on the parameter.
 */
export function resolveMark(
  pageId: string,
  byId: ReadonlyMap<string, MarkSource>,
  fallback?: MarkSource
): PageMark {
  // `fallback` is the page itself, for a caller that holds it but whose map does
  // not. Two real cases, both of which silently BLANKED the mark before it
  // existed: `fetchPages` deliberately excludes HOME_TYPE and ROW_TYPE rows from
  // the shared `['pages']` cache, and a presentational render (Storybook, a unit
  // test) has a tree but no pond. Without it an unknown page lost its
  // title-derived glyph entirely, which is not "derive" — it is "disappear".
  const page = byId.get(pageId) ?? fallback
  if (!page) {
    return { glyph: null, role: null, roleIsOwn: false, glyphIsOwn: false }
  }

  const ownGlyph = typeof page.glyph === 'string' && page.glyph.length > 0 ? page.glyph : null
  const glyph = ownGlyph ?? areaGlyph(page.title) ?? null

  // Walk up for a role: this page first, then its ancestors. `seen` guards a
  // malformed parent cycle the same way `rootAncestorId` does.
  const seen = new Set<string>()
  let cursor: MarkSource | undefined = page
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    if (isAreaRole(cursor.areaRole)) {
      return {
        glyph,
        role: cursor.areaRole,
        roleIsOwn: cursor.id === pageId,
        glyphIsOwn: ownGlyph !== null,
      }
    }
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId)
  }

  return { glyph, role: null, roleIsOwn: false, glyphIsOwn: ownGlyph !== null }
}

/** Build the lookup `resolveMark` takes from raw `pages` rows. */
export function markIndex(
  rows: readonly {
    id: string
    parent_id: string | null
    title: string
    glyph?: string | null
    area_role?: string | null
  }[]
): Map<string, MarkSource> {
  const map = new Map<string, MarkSource>()
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      parentId: r.parent_id,
      title: r.title,
      glyph: r.glyph ?? null,
      areaRole: r.area_role ?? null,
    })
  }
  return map
}
