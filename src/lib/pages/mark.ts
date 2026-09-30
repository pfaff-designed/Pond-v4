/**
 * A page's mark — which glyph it shows and in which colour (issue #134).
 *
 * ONE function owns the whole rule, because three surfaces render the mark (the
 * rail row, the breadcrumb crumb, the overview kicker) and they must never
 * disagree about the same page.
 *
 * THE RULE, in order:
 *
 *   glyph  explicit on the page  →  else derived from its title (#91's
 *          `areaGlyph`, which only knows the six seeded areas)  →  else none,
 *          and the surface falls back to its `KindDot`.
 *
 *   colour explicit role on the page  →  else the nearest ANCESTOR with an
 *          explicit role  →  else a role derived from the top-level ancestor's
 *          id, so a whole area still reads as one colour.
 *
 * The inheritance walk is what keeps "a whole area reads as one hue"
 * (`accent.ts`) true everywhere nobody has intervened: a child with no role of
 * its own takes its area's, and an explicit role is a deliberate exception the
 * person made. It also means the migration needs no backfill — null is the
 * answer for every page that has never been touched.
 *
 * WHAT THIS REPLACED. `pageAccent(rootAncestorId(...))` hashed a page id onto the
 * Press six (sage · slate · gold · clay · mauve · olive). Those are what #135
 * exists to retire, and AGENTS.md names a different set — sage / mist / navy —
 * as the area colours. The derived fallback now lands on the theme's area ROLES,
 * so every mark in the pond speaks one vocabulary and a customised mark is
 * indistinguishable in kind from a default one.
 *
 * Pure — no React, no Supabase, no colour values. A role becomes a colour in
 * exactly one place, `areaRoleColor`.
 */

import { areaGlyph } from '@/lib/rail/area-glyph'
import { AREA_ROLES, isAreaRole, type AreaRole } from '@/lib/rail/glyph-library'

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
  /** The area role to tint with. Always resolves — every page has a colour. */
  role: AreaRole
  /** True when this page carries its own role rather than inheriting one. */
  roleIsOwn: boolean
  /** True when this page carries its own glyph rather than deriving from its title. */
  glyphIsOwn: boolean
}

/**
 * A role derived from an id, stable across renders and sessions.
 *
 * The same shape as the hash `pageAccent` used, pointed at the theme's roles
 * instead of a raw palette. Applied to the TOP-LEVEL ancestor by the caller, so
 * siblings in an area agree.
 */
export function derivedRole(id: string): AreaRole {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AREA_ROLES[h % AREA_ROLES.length]
}

/**
 * Resolve the mark for `pageId` against the pond's pages.
 *
 * `byId` is every page the caller knows about — in practice the `['pages',
 * workspace]` cache the rail, breadcrumb and overview already share, so no
 * surface fetches anything new to draw a mark.
 *
 * An unknown `pageId` with no `fallback` still returns a mark — a derived role
 * and no glyph — because a missing page must not blank a row. A caller that
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
    return { glyph: null, role: derivedRole(pageId), roleIsOwn: false, glyphIsOwn: false }
  }

  const ownGlyph = typeof page.glyph === 'string' && page.glyph.length > 0 ? page.glyph : null
  const glyph = ownGlyph ?? areaGlyph(page.title) ?? null

  // Walk up for a role: this page first, then its ancestors. `seen` guards a
  // malformed parent cycle the same way `rootAncestorId` does — colour by where
  // we stopped rather than loop for ever.
  const seen = new Set<string>()
  let cursor: MarkSource | undefined = page
  let last: MarkSource = page
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
    last = cursor
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId)
  }

  // Nobody up the chain chose one, so the whole area derives from its root —
  // which is `last`, the highest page we could actually reach.
  return { glyph, role: derivedRole(last.id), roleIsOwn: false, glyphIsOwn: ownGlyph !== null }
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
