/**
 * The glyph library the mark picker offers, and the area roles it tints with
 * (issue #134).
 *
 * WHY A CURATED SUBSET. `public/icons/` holds 182 PNGs, but 140 of them are named
 * `asset-1.png` … `asset-115.png`. Search and grouping are meaningless over a
 * name like `asset-113`, so the picker offers the 42 that carry real names,
 * grouped by family. The unnamed files stay on disk and remain referenceable —
 * an existing `glyph` value pointing at one still renders — they are simply not
 * offered. Naming more of them later means editing THIS FILE ONLY: the picker,
 * the store and the schema are untouched.
 *
 * Pure data — no React, no Supabase. Server- and client-safe.
 */

/** One family of glyphs, as the picker groups them. */
export interface GlyphFamily {
  /** The group heading, in Pond's lowercase register. */
  name: string
  /** Glyph names, each a `public/icons/<name>.png`. */
  glyphs: string[]
}

/**
 * The offered glyphs, grouped. Families are the shape a person searches by
 * ("something with a flower"), not a taxonomy — `nature` holds the living
 * things, `marks` the geometric ones, `sky` what is overhead.
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

/**
 * Glyphs whose name or family matches `query`. Empty query → everything, still
 * grouped. Matching on the family name too is what makes "flower" find `tulip-01`.
 */
export function searchGlyphs(query: string): GlyphFamily[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...GLYPH_FAMILIES]
  const out: GlyphFamily[] = []
  for (const family of GLYPH_FAMILIES) {
    if (family.name.includes(q)) {
      out.push(family)
      continue
    }
    const glyphs = family.glyphs.filter((g) => g.includes(q))
    if (glyphs.length > 0) out.push({ name: family.name, glyphs })
  }
  return out
}

// ── Area roles ───────────────────────────────────────────────────────────────

/**
 * The area colour ROLES the pond's theme defines — never colours.
 *
 * "Raw palette values never move — only roles reassign (8 themes, 1g)"
 * (AGENTS.md §Design language). A picker offering `sage` would pin a mark to one
 * theme's palette; a picker offering `area-a` follows whatever the active theme
 * assigns it to, because the swatch and the mark both render
 * `var(--mn-area-a)`. Today those resolve to sage / mist / navy, which is
 * exactly the set the design names as "Area colours (marks only — area glyph +
 * page-kind dots)".
 *
 * KNOWN, AND NOT A BUG HERE: `globals.css` overrides `--mn-area-c` to mist on
 * dark ("navy → mist on dark"), so `area-b` and `area-c` look identical in dark
 * mode. They stay distinct roles and diverge again under any theme that assigns
 * them separately; giving `area-c` its own dark value is a token-layer decision
 * that belongs with #135.
 */
export const AREA_ROLES = ['area-a', 'area-b', 'area-c'] as const

export type AreaRole = (typeof AREA_ROLES)[number]

export function isAreaRole(value: unknown): value is AreaRole {
  return typeof value === 'string' && (AREA_ROLES as readonly string[]).includes(value)
}

/** The CSS a role resolves to. The ONE place a role becomes a colour. */
export function areaRoleColor(role: AreaRole): string {
  return `var(--mn-${role})`
}

/** The colour a mark paints, or undefined for ink — the default until one is chosen. */
export function markAccent(role: AreaRole | null): string | undefined {
  return role === null ? undefined : areaRoleColor(role)
}
