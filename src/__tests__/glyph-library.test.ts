/**
 * The glyph library — src/lib/rail/glyph-library.ts — and the automatic area
 * glyph — src/lib/rail/area-glyph.ts.
 *
 * All 182 files in `public/icons/` are in the library: 42 by name, 140 by
 * number. Search is "name contains the text", numbered shapes match by number,
 * and a pond keeps the 8 glyphs last picked in it.
 */

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GLYPH_FAMILIES,
  GLYPH_LIBRARY,
  NAMED_GLYPHS,
  RECENT_GLYPHS_LIMIT,
  pushRecentGlyph,
  searchGlyphs,
} from '@/lib/rail/glyph-library'
import { LIFE_GLYPH, areaGlyph } from '@/lib/rail/area-glyph'

const ICONS = readdirSync(resolve(__dirname, '../../public/icons'))
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.replace(/\.png$/, ''))

describe('GLYPH_LIBRARY — all 182', () => {
  it('has 182 entries: every file in public/icons, once', () => {
    expect(GLYPH_LIBRARY).toHaveLength(182)
    const glyphs = GLYPH_LIBRARY.map((g) => g.glyph)
    expect(new Set(glyphs).size).toBe(182)
    expect([...glyphs].sort()).toEqual([...ICONS].sort())
  })

  it('42 have names, each in a family; 140 have numbers and no family', () => {
    const named = GLYPH_LIBRARY.filter((g) => g.family !== null)
    const numbered = GLYPH_LIBRARY.filter((g) => g.family === null)
    expect(named).toHaveLength(42)
    expect(numbered).toHaveLength(140)
    for (const g of named) expect(g.label).toBe(g.glyph)
    for (const g of numbered) expect(g.glyph).toBe(`asset-${g.label}`)
  })

  it('keeps the named glyphs in their families', () => {
    expect(GLYPH_FAMILIES.flatMap((f) => f.glyphs).sort()).toEqual([...NAMED_GLYPHS].sort())
    const tulip = GLYPH_LIBRARY.find((g) => g.glyph === 'tulip-01')
    expect(tulip?.family).toBe('flower')
  })

  it('library order: the named glyphs as the board lists them, then the numbers ascending', () => {
    const labels = GLYPH_LIBRARY.map((g) => g.label)
    expect(labels.slice(0, 3)).toEqual(['abstract-shape', 'arrow-02', 'bird'])
    expect(labels[41]).toBe('waves-02')
    expect(labels.slice(42, 46)).toEqual(['1', '2', '3', '4'])
    expect(labels[181]).toBe('161')
    const numbers = labels.slice(42).map(Number)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })
})

describe('searchGlyphs — name contains the text', () => {
  it("'flow' finds the flower glyphs", () => {
    expect(searchGlyphs('flow').map((g) => g.glyph)).toEqual([
      'flower-02',
      'flower-05',
      'flower-06',
    ])
  })

  it("'113' finds asset-113 — numbered shapes are found by number", () => {
    expect(searchGlyphs('113').map((g) => g.glyph)).toEqual(['asset-113'])
  })

  it('matches the name only, not the family', () => {
    // A family is not a name: `tulip-01` is in `flower` but is not called flower.
    expect(searchGlyphs('flow').some((g) => g.glyph === 'tulip-01')).toBe(false)
  })

  it('is case- and whitespace-insensitive, and keeps library order', () => {
    expect(searchGlyphs('  STAR ').map((g) => g.glyph)).toEqual(['star-01', 'star-02', 'star-03'])
  })

  it('an empty query is the whole library; no match is empty', () => {
    expect(searchGlyphs('')).toHaveLength(182)
    expect(searchGlyphs('zebra')).toEqual([])
  })
})

describe('pushRecentGlyph — the last 8 distinct, newest first', () => {
  it('puts the pick first', () => {
    expect(pushRecentGlyph(['moon', 'sun'], 'heart')).toEqual(['heart', 'moon', 'sun'])
  })

  it('moves a repeat pick to the front instead of listing it twice', () => {
    expect(pushRecentGlyph(['moon', 'sun', 'heart'], 'heart')).toEqual(['heart', 'moon', 'sun'])
  })

  it('caps the list at 8, dropping the oldest', () => {
    const full = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']
    const next = pushRecentGlyph(full, 'heart')
    expect(RECENT_GLYPHS_LIMIT).toBe(8)
    expect(next).toHaveLength(8)
    expect(next[0]).toBe('heart')
    expect(next).not.toContain('a8')
  })

  it('never mutates the list it was given', () => {
    const recent = Object.freeze(['moon', 'sun'])
    pushRecentGlyph(recent, 'heart')
    expect(recent).toEqual(['moon', 'sun'])
  })
})

describe('areaGlyph — an area’s automatic glyph, from its title', () => {
  it('keeps the seeded areas’ glyphs', () => {
    expect(areaGlyph('Personal')).toBe('house')
    expect(areaGlyph('professional')).toBe('ramp')
    expect(areaGlyph('Health')).toBe('heart')
    expect(areaGlyph('money')).toBe('ring')
    expect(areaGlyph('Finances')).toBe('ring')
    expect(areaGlyph('Financial')).toBe('ring')
    expect(areaGlyph('creativity')).toBe('star-01')
  })

  it('gives every other title a named glyph, the same one every time', () => {
    for (const title of ['Food', 'Garden', 'clients', 'Scratchpad', '']) {
      const glyph = areaGlyph(title)
      expect(NAMED_GLYPHS).toContain(glyph)
      expect(areaGlyph(title)).toBe(glyph)
    }
  })

  it('never gives a title the pond’s glyph or a seeded area’s glyph', () => {
    const reserved = [LIFE_GLYPH, 'house', 'ramp', 'heart', 'ring', 'star-01']
    for (let i = 0; i < 500; i++) {
      expect(reserved).not.toContain(areaGlyph(`area ${i}`))
    }
  })

  it('derives from the lowercased title, so case and padding do not move it', () => {
    expect(areaGlyph('  GARDEN ')).toBe(areaGlyph('garden'))
  })

  it('spreads titles across the library rather than piling onto one glyph', () => {
    const titles = Array.from({ length: 60 }, (_, i) => `area ${i}`)
    expect(new Set(titles.map(areaGlyph)).size).toBeGreaterThan(20)
  })
})
