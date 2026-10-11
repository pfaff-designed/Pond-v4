/**
 * The glyph picker's lists — `PondPicker kind="glyph"` (KAN-248).
 *
 * The no-match copy and the automatic row's note are read off
 * `PondPicker.dc.html`'s own `glyph` branch at test time (never hand-copied),
 * so a board edit fails this suite before it fails a person.
 */

import { automaticRow, glyphSections, noMatchText } from '@/components/molecules/glyph-entries'
import { GLYPH_LIBRARY, RECENT_GLYPHS_LIMIT, searchGlyphs } from '@/lib/rail/glyph-library'
import { areaGlyph } from '@/lib/rail/area-glyph'
import { readHandoff } from './helpers/handoff'

/** The board's `noMatchText` template literal, placeholder and all. */
function boardNoMatchTemplate(): string {
  const html = readHandoff('PondPicker.dc.html')
  const m = html.match(/noMatchText:\s*`([^`]*)`/)
  if (!m) throw new Error('PondPicker.dc.html has no `noMatchText` template')
  return m[1]
}

/** The board's two `autoNote` branches: the area's template, and the page's literal. */
function boardAutoNote(): { areaTemplate: string; pageNote: string } {
  const html = readHandoff('PondPicker.dc.html')
  const m = html.match(/autoNote:\s*autoG \? `([^`]*)` : '([^']*)'/)
  if (!m) throw new Error('PondPicker.dc.html has no `autoNote` branches')
  return { areaTemplate: m[1], pageNote: m[2] }
}

// ── The handoff really was read ──────────────────────────────────────────────

describe('the parsers', () => {
  it('read the board’s own no-match template and automatic-row branches', () => {
    expect(boardNoMatchTemplate()).toContain('${q}')
    const { areaTemplate, pageNote } = boardAutoNote()
    expect(areaTemplate).toContain('${autoG}')
    expect(pageNote).toBe('the kind dot')
  })
})

// ── automatic ─────────────────────────────────────────────────────────────────

describe('automaticRow — the kind dot for a page, the derived glyph for an area', () => {
  it('a page: the dot, no glyph, the board’s own note', () => {
    const row = automaticRow({ isArea: false, title: 'workouts' })
    expect(row).toEqual({ isDot: true, glyph: null, note: boardAutoNote().pageNote })
  })

  it('an area: its title-derived glyph, noted `<glyph>, from the title` — the board’s template', () => {
    const row = automaticRow({ isArea: true, title: 'health' })
    const glyph = areaGlyph('health')
    expect(row.isDot).toBe(false)
    expect(row.glyph).toBe(glyph)
    expect(row.note).toBe(boardAutoNote().areaTemplate.replace('${autoG}', glyph))
  })

  it('the note genuinely differs between a page and an area of the same title', () => {
    const page = automaticRow({ isArea: false, title: 'health' })
    const area = automaticRow({ isArea: true, title: 'health' })
    expect(page.note).not.toBe(area.note)
  })
})

// ── sections — recent and library ────────────────────────────────────────────

describe('glyphSections — no query', () => {
  const RECENT = ['heart', 'leaf-01', 'sun', 'moon', 'tulip-01', 'ring', 'star-02', 'clover-01']

  it('`recent` (capped to RECENT_GLYPHS_LIMIT, pond order) then `library`, the whole 182', () => {
    const over = [...RECENT, 'star-01']
    const sections = glyphSections('', over)
    expect(sections[0]).toEqual({
      label: 'recent',
      count: 'in this pond',
      cells: over.slice(0, RECENT_GLYPHS_LIMIT).map((g) => ({ glyph: g, label: g })),
    })
    expect(sections[0].cells).toHaveLength(RECENT_GLYPHS_LIMIT)
    expect(sections[1].label).toBe('library')
    expect(sections[1].count).toBe(String(GLYPH_LIBRARY.length))
    expect(sections[1].cells).toHaveLength(GLYPH_LIBRARY.length)
  })

  it('a pond with no recent glyph yet: no `recent` section, just `library`', () => {
    expect(glyphSections('', []).map((s) => s.label)).toEqual(['library'])
  })
})

describe('glyphSections — narrowing by a query', () => {
  it('narrows to the glyphs whose label contains the query — named glyphs by name', () => {
    const sections = glyphSections('flower', [])
    expect(sections).toHaveLength(1)
    expect(sections[0]).toEqual({
      label: 'matches',
      count: String(searchGlyphs('flower').length),
      cells: searchGlyphs('flower').map((g) => ({ glyph: g.glyph, label: g.label })),
    })
    expect(sections[0].cells.length).toBeGreaterThan(0)
  })

  it('narrows numbered glyphs by number, the same rule as named ones', () => {
    const sections = glyphSections('12', [])
    expect(sections[0].cells.map((c) => c.glyph)).toEqual(searchGlyphs('12').map((g) => g.glyph))
    expect(sections[0].cells.map((c) => c.glyph)).toContain('asset-12')
  })

  it('no hits: no section at all, so the picker draws the no-match note instead', () => {
    expect(glyphSections('no such glyph', [])).toEqual([])
  })
})

// ── no-match copy ─────────────────────────────────────────────────────────────

describe('noMatchText — the board’s copy, verbatim', () => {
  it('builds the exact string the board renders, read off the board, not hand-copied', () => {
    const expected = boardNoMatchTemplate().replace('${q}', 'zz')
    expect(noMatchText('zz')).toBe(expected)
  })

  it('lowercases and trims the query the same way `searchGlyphs` matches it', () => {
    const expected = boardNoMatchTemplate().replace('${q}', 'zz')
    expect(noMatchText('  ZZ  ')).toBe(expected)
  })
})
