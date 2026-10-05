/**
 * The fixed default area→glyph map (#91). Each of the six areas Pond seeds
 * carries one Make Noise glyph (a `public/icons/<name>.png` silhouette); the
 * Life root has its own. Nothing here is user-assignable — per-area glyph
 * storage and a picker are a named follow-up.
 *
 * Resolution is by TITLE, case- and whitespace-insensitive, because an area is
 * only a `pages` row that happens to have pages inside it (#108 dropped
 * `type = 'area'`): there is no stable key besides its name. Both "Finances"
 * (what `seed_default_pages` now writes, #107) and the older "Financial" resolve.
 * An unmapped area (a user's own, e.g. Food) resolves to nothing and keeps its
 * KindDot.
 */

/** The Life root's glyph — `PondRail.dc.html` draws the root as `data-icon="waves-02"`. */
export const LIFE_GLYPH = 'waves-02'

const AREA_GLYPH: Record<string, string> = {
  personal: 'house',
  professional: 'star-01',
  health: 'leaf-01',
  finances: 'stairs-01',
  financial: 'stairs-01',
  creativity: 'flower-05',
}

/** The default glyph for an area title, or `undefined` when it has none. */
export function areaGlyph(title: string): string | undefined {
  return AREA_GLYPH[title.trim().toLowerCase()]
}
