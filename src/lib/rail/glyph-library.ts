/**
 * The glyph library, the area roles a mark is tinted with, and the recent-glyph
 * list a pond keeps.
 *
 * Every file in `public/icons/` is in the library — all 182: the 42 named ones
 * by name, each in its family, and the 140 `asset-N` ones by number, found by
 * number.
 *
 * Pure data — no React, no Supabase. Server- and client-safe.
 */

/** One family of named glyphs. */
export interface GlyphFamily {
  /** The family name, in Pond's lowercase register. */
  name: string
  /** Glyph names, each a `public/icons/<name>.png`. */
  glyphs: string[]
}

/**
 * The named glyphs, by family. Families are the shape a person browses by
 * ("something with a flower"), not a taxonomy — `nature` holds the living
 * things, `shape` and `form` the geometric ones, `sky` what is overhead.
 */
export const GLYPH_FAMILIES: readonly GlyphFamily[] = [
  { name: 'flower', glyphs: ['flower-02', 'flower-05', 'flower-06', 'tulip-01', 'clover-01'] },
  { name: 'nature', glyphs: ['leaf-01', 'grass', 'tree-ellipsis', 'bird', 'ears', 'peanut'] },
  { name: 'sky', glyphs: ['sun', 'moon', 'meteor', 'lightning-03', 'lightning-04', 'fat-flake'] },
  { name: 'star', glyphs: ['star-01', 'star-02', 'star-03'] },
  {
    name: 'shape',
    glyphs: ['circle-02', 'ring', 'triangle-01', 'triangle-02', 'quadrant', 'pill'],
  },
  {
    name: 'form',
    glyphs: [
      'square-rounded-corner',
      'circle-in-square',
      'abstract-shape',
      'edge-01',
      'tube',
      'waves-02',
    ],
  },
  { name: 'place', glyphs: ['house', 'stairs-01', 'stairs-02', 'rounded-stairs', 'ramp'] },
  { name: 'thing', glyphs: ['heart', 'eye', 'cake', 'arrow-02', 'pacman'] },
]

/** The 42 named glyphs in library order: by name. */
export const NAMED_GLYPHS: readonly string[] = GLYPH_FAMILIES.flatMap((f) => f.glyphs).sort()

/** The numbers of the 140 `public/icons/asset-<n>.png` files. The gaps are real. */
const NUMBERED_GLYPHS: readonly number[] = [
  1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,
  54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 65, 66, 67, 68, 69, 71, 72, 73, 74, 78, 80, 83, 86, 87,
  88, 90, 91, 92, 93, 94, 95, 99, 100, 101, 103, 104, 105, 106, 107, 108, 109, 110, 112, 113, 115,
  116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134,
  135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153,
  154, 155, 156, 158, 159, 160, 161,
]

/** One glyph in the library. */
export interface LibraryGlyph {
  /** The stored value and the file: `public/icons/<glyph>.png`. */
  glyph: string
  /** What a person searches and reads: the name, or the number for an `asset-N`. */
  label: string
  /** The named glyph's family, or null for a numbered one. */
  family: string | null
}

const familyOf = new Map(GLYPH_FAMILIES.flatMap((f) => f.glyphs.map((g) => [g, f.name])))

/** All 182 glyphs in library order: the named ones, then the numbered ones ascending. */
export const GLYPH_LIBRARY: readonly LibraryGlyph[] = [
  ...NAMED_GLYPHS.map((glyph) => ({ glyph, label: glyph, family: familyOf.get(glyph) ?? null })),
  ...NUMBERED_GLYPHS.map((n) => ({ glyph: `asset-${n}`, label: String(n), family: null })),
]

/** The glyphs whose label contains `query`, in library order. Empty query → the whole library. */
export const searchGlyphs = (query: string): LibraryGlyph[] => {
  const q = query.trim().toLowerCase()
  if (q === '') return [...GLYPH_LIBRARY]
  return GLYPH_LIBRARY.filter((g) => g.label.includes(q))
}

// ── Recent glyphs ────────────────────────────────────────────────────────────

/** How many recent glyphs a pond keeps — `ponds.recent_glyphs` refuses more. */
export const RECENT_GLYPHS_LIMIT = 8

/** The pond's recent list after `glyph` is picked: distinct, newest first, capped. */
export const pushRecentGlyph = (recent: readonly string[], glyph: string): string[] =>
  [glyph, ...recent.filter((g) => g !== glyph)].slice(0, RECENT_GLYPHS_LIMIT)

// ── Area roles ───────────────────────────────────────────────────────────────

/**
 * The area colour ROLES the pond's theme defines — never colours.
 *
 * "Raw palette values never move — only roles reassign (8 themes, 1g)". A stored
 * `area-c` follows whatever the active theme assigns it, because the mark renders
 * `var(--mn-area-c)`. Today those resolve to sage / mist / navy, and navy draws as
 * mist on the dark ground while the stored role stays `area-c`.
 */
export const AREA_ROLES = ['area-a', 'area-b', 'area-c'] as const

export type AreaRole = (typeof AREA_ROLES)[number]

export const isAreaRole = (value: unknown): value is AreaRole =>
  typeof value === 'string' && (AREA_ROLES as readonly string[]).includes(value)

/** The CSS a role resolves to. The ONE place a role becomes a colour. */
export const areaRoleColor = (role: AreaRole): string => `var(--mn-${role})`

/** The colour a mark paints, or undefined for ink — the default, and no colour. */
export const markAccent = (role: AreaRole | null): string | undefined =>
  role === null ? undefined : areaRoleColor(role)
