/**
 * KAN-248 path walk 3/3 — "everywhere": the rail, the breadcrumb and the
 * palette never read a page's mark their own way. All three sit downstream
 * of the ONE `['pages']` cache and the ONE `resolveMark` — the rail directly
 * (`rowMark` in Rail.tsx), `commandPath` for the breadcrumb's leading glyph,
 * `paletteItems` for a ⌘K row. A pick in one surface is a write to that cache,
 * so proving the three derivations agree on it is proving "at once" without
 * rendering any of them.
 *
 * The breadcrumb's leading glyph has two cases, both proven below: a child
 * with no glyph of its own leads with its area's mark (the default); a child
 * WITH its own glyph leads with that glyph instead, overriding the area
 * (6y frames 4/5 — workouts shows a flower while health stays sage).
 */
import { commandPath } from '@/lib/pages/command-path'
import { markIndex, resolveMark } from '@/lib/pages/mark'
import { paletteItems } from '@/lib/pages/palette-items'
import type { PageRow } from '@/lib/pages/tree'
import { LIFE_GLYPH } from '@/lib/rail/area-glyph'

const at = '2026-01-01T00:00:00Z'
const rowsWith = (healthGlyph: string | null, sleepGlyph: string | null): PageRow[] => [
  {
    id: 'health',
    parent_id: null,
    type: 'page',
    title: 'Health',
    order: 0,
    updated_at: at,
    glyph: healthGlyph,
  },
  {
    id: 'sleep',
    parent_id: 'health',
    type: 'page',
    title: 'Sleep',
    order: 0,
    updated_at: at,
    glyph: sleepGlyph,
  },
]
const opts = (current: string) => ({ rootTitle: 'life', current, pondGlyph: LIFE_GLYPH })

describe('a picked glyph shows in the rail, the breadcrumb and ⌘K at once (PATH_STEPS 6)', () => {
  it('an area’s own pick: the rail row, the breadcrumb leading the area itself and a CHILD WITH NO GLYPH OF ITS OWN, and the palette row all agree', () => {
    const rows = rowsWith('fat-flake', null)
    const index = markIndex(rows)

    expect(resolveMark('health', index).glyph).toBe('fat-flake')
    expect(commandPath(rows, 'health', opts('Health')).glyph).toBe('fat-flake')
    expect(commandPath(rows, 'sleep', opts('Sleep')).glyph).toBe('fat-flake')
    expect(paletteItems(rows, []).find((item) => item.id === 'health')?.glyph).toBe('fat-flake')
  })

  it('a CHILD WITH ITS OWN glyph leads the breadcrumb with that glyph, not its area’s (6y frames 4/5: workouts shows a flower while health stays sage)', () => {
    const rows = rowsWith('heart', 'flower-02')

    expect(commandPath(rows, 'sleep', opts('Sleep')).glyph).toBe('flower-02')
  })

  it('a plain page with no glyph: the rail and the palette fall back to the kind dot (null), never the automatic area glyph', () => {
    const rows = rowsWith(null, null)
    const index = markIndex(rows)

    expect(resolveMark('sleep', index).glyph).toBeNull()
    expect(paletteItems(rows, []).find((item) => item.id === 'sleep')?.glyph).toBeUndefined()
  })

  it('an area with no explicit glyph: automatic is title-derived, not null — the breadcrumb (for a CHILD WITH NO GLYPH OF ITS OWN) and the palette both read it', () => {
    const rows = rowsWith(null, null)
    const index = markIndex(rows)
    const automatic = resolveMark('health', index).glyph
    expect(automatic).not.toBeNull()

    expect(commandPath(rows, 'sleep', opts('Sleep')).glyph).toBe(automatic)
    expect(paletteItems(rows, []).find((item) => item.id === 'health')?.glyph).toBe(automatic)
  })
})
