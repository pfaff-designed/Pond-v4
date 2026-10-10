/**
 * What the glyph picker lists at each step — pure, so `GlyphPicker.tsx` only
 * draws (KAN-248, `source-entries.ts`'s split from `SourcePicker.tsx`).
 * `PondPicker kind="glyph"`, `PondPicker.dc.html`:
 *
 *   automatic  a page's is "the kind dot" — no glyph, the surface's own
 *              `KindDot`; an area's is its title-derived glyph (`areaGlyph`),
 *              noted `<glyph>, from the title`.
 *   recent     "in this pond", up to `RECENT_GLYPHS_LIMIT` (8), newest first.
 *   library    the whole 182 (`GLYPH_LIBRARY`), narrowed by a query to the
 *              glyphs whose label (name, or number for an `asset-N`) contains
 *              it — named by name, numbered by number, one rule
 *              (`searchGlyphs`). No hits draws the DC's `noMatchText` note
 *              instead of a `library` section.
 */

import {
  GLYPH_LIBRARY,
  RECENT_GLYPHS_LIMIT,
  searchGlyphs,
  type LibraryGlyph,
} from '@/lib/rail/glyph-library'
import { areaGlyph } from '@/lib/rail/area-glyph'

/** One glyph cell the grid draws. */
export interface GlyphCell {
  glyph: string
  /** What a person searches and reads — `searchGlyphs`' own `label`. */
  label: string
}

/** The `automatic` row: a page shows its kind dot, an area its derived glyph. */
export interface AutomaticRow {
  /** True for a page — the row draws the dot, not a glyph. */
  isDot: boolean
  /** The area's derived glyph; null for a page's dot. */
  glyph: string | null
  /** The row's note, verbatim from the DC. */
  note: string
}

/** The automatic row for a target that is a page, or an area titled `title`. */
export function automaticRow(target: { isArea: boolean; title: string }): AutomaticRow {
  if (!target.isArea) return { isDot: true, glyph: null, note: 'the kind dot' }
  const glyph = areaGlyph(target.title)
  return { isDot: false, glyph, note: `${glyph}, from the title` }
}

/** A grouped section of cells, with the DC's own count string (`"182"` / `"in this pond"`). */
export interface GlyphSection {
  label: string
  count: string
  cells: GlyphCell[]
}

const toCell = (g: LibraryGlyph): GlyphCell => ({ glyph: g.glyph, label: g.label })

/**
 * The sections below the automatic row. No query: `recent` (when the pond has
 * any, capped to `RECENT_GLYPHS_LIMIT`) then `library`, the whole 182. A
 * query: `matches` alone, over the same `searchGlyphs` rule the library
 * narrows by — or no section at all, so the picker draws `noMatchText` instead.
 */
export function glyphSections(query: string, recent: readonly string[]): GlyphSection[] {
  const q = query.trim()
  if (q === '') {
    const sections: GlyphSection[] = []
    if (recent.length) {
      sections.push({
        label: 'recent',
        count: 'in this pond',
        cells: recent.slice(0, RECENT_GLYPHS_LIMIT).map((glyph) => ({ glyph, label: glyph })),
      })
    }
    sections.push({
      label: 'library',
      count: String(GLYPH_LIBRARY.length),
      cells: GLYPH_LIBRARY.map(toCell),
    })
    return sections
  }
  const hits = searchGlyphs(q)
  if (!hits.length) return []
  return [{ label: 'matches', count: String(hits.length), cells: hits.map(toCell) }]
}

/** The DC's exact no-match copy for a query with zero hits. */
export function noMatchText(query: string): string {
  const q = query.trim().toLowerCase()
  return `no glyph called “${q}”. most shapes have a number, not a name: try a number, or browse the library.`
}
