/**
 * The fixed default area→glyph map — `PondRail.dc.html`'s `G`. Each of the areas
 * Pond seeds carries one Make Noise glyph (a `public/icons/<name>.png`
 * silhouette); the root carries the pond's own, `LIFE_GLYPH` when it has none. A
 * glyph a person picks overrides these (`resolveMark`).
 *
 * Resolution is by TITLE, case- and whitespace-insensitive, because an area is
 * only a `pages` row that happens to have pages inside it (#108 dropped
 * `type = 'area'`): there is no stable key besides its name. The board's
 * "money", what `seed_default_pages` writes ("Finances", #107) and the older
 * "Financial" all resolve. An unmapped area (a user's own, e.g. Food) resolves to nothing and keeps its
 * KindDot.
 */

/** The Life root's glyph, and the fallback for a pond with none of its own. */
export const LIFE_GLYPH = 'waves-02'

const AREA_GLYPH: Record<string, string> = {
  personal: 'house',
  professional: 'ramp',
  health: 'heart',
  money: 'ring',
  finances: 'ring',
  financial: 'ring',
  creativity: 'star-01',
}

/** The default glyph for an area title, or `undefined` when it has none. */
export function areaGlyph(title: string): string | undefined {
  return AREA_GLYPH[title.trim().toLowerCase()]
}
