/**
 * An area's automatic glyph — derived from its title, so it follows a rename. A
 * glyph the person picks replaces it and does not (`resolveMark`).
 *
 * The seeded areas carry `PondRail.dc.html`'s `G` map. Every other title gets a
 * stable glyph from the 42 named ones, hashed from the trimmed, lowercased title,
 * so the same name always draws the same mark. The root carries the pond's own
 * glyph, `LIFE_GLYPH` when it has none.
 *
 * Resolution is by TITLE because an area is only a top-level `pages` row: there
 * is no stable key besides its name. The board's "money", what
 * `seed_default_pages` writes ("finances") and the older "financial" all resolve.
 */

import { NAMED_GLYPHS } from '@/lib/rail/glyph-library'

/** The Life root's glyph, and the fallback for a pond with none of its own. */
export const LIFE_GLYPH = 'waves-02'

const AREA_GLYPH: Readonly<Record<string, string>> = {
  personal: 'house',
  professional: 'ramp',
  health: 'heart',
  money: 'ring',
  finances: 'ring',
  financial: 'ring',
  creativity: 'star-01',
}

/** 32-bit FNV-1a: stable across sessions and runtimes, unlike anything keyed on identity. */
const hashTitle = (title: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < title.length; i++) {
    hash ^= title.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The automatic glyph for an area titled `title`. */
export const areaGlyph = (title: string): string => {
  const key = title.trim().toLowerCase()
  return AREA_GLYPH[key] ?? NAMED_GLYPHS[hashTitle(key) % NAMED_GLYPHS.length]
}
