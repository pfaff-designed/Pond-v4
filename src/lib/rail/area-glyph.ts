/**
 * An area's automatic glyph — derived from its title, so it follows a rename. A
 * glyph the person picks replaces it and does not (`resolveMark`).
 *
 * The seeded areas carry fixed glyphs. Every other title gets a stable glyph
 * from the named ones that no seeded area and no pond default uses, hashed from
 * the trimmed, lowercased title, so the same name always draws the same mark and
 * never the mark of Life or Health. The root carries the pond's own glyph,
 * `LIFE_GLYPH` when it has none.
 *
 * Resolution is by TITLE because an area is only a top-level `pages` row: there
 * is no stable key besides its name. "money", "finances" and "financial" all
 * resolve.
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

const RESERVED = new Set([LIFE_GLYPH, ...Object.values(AREA_GLYPH)])

/** The glyphs an unseeded title may derive. */
const DERIVED_POOL: readonly string[] = NAMED_GLYPHS.filter((g) => !RESERVED.has(g))

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
  return AREA_GLYPH[key] ?? DERIVED_POOL[hashTitle(key) % DERIVED_POOL.length]
}
