/**
 * A page's mark — src/lib/pages/mark.ts (issue #134).
 *
 * The contract this pins is the inheritance rule, because three surfaces render
 * the same mark and a disagreement between them is the bug this module exists to
 * make impossible:
 *
 *   - an explicit choice wins, and survives a rename (the original complaint);
 *   - a page with no role of its own takes its AREA's, so "a whole area reads as
 *     one hue" stays true everywhere nobody has intervened;
 *   - nothing anywhere resolves to a colour — only to a role.
 */

import { derivedRole, markIndex, resolveMark, type MarkSource } from '@/lib/pages/mark'
import { AREA_ROLES } from '@/lib/rail/glyph-library'

function index(rows: MarkSource[]): Map<string, MarkSource> {
  return new Map(rows.map((r) => [r.id, r]))
}

/** Personal (an area) → Recipes → Pasta. */
const TREE: MarkSource[] = [
  { id: 'personal', parentId: null, title: 'Personal' },
  { id: 'recipes', parentId: 'personal', title: 'Recipes' },
  { id: 'pasta', parentId: 'recipes', title: 'Pasta' },
]

describe('derivedRole', () => {
  it('is stable and always one of the theme’s roles', () => {
    expect(derivedRole('abc')).toBe(derivedRole('abc'))
    for (const id of ['a', 'b', 'c', 'personal', 'x'.repeat(40)]) {
      expect(AREA_ROLES).toContain(derivedRole(id))
    }
  })

  it('is not the Press palette — no mark resolves to a hex', () => {
    // #135 retires those six; AGENTS.md names sage/mist/navy as the area colours.
    expect(derivedRole('personal')).toMatch(/^area-[abc]$/)
  })
})

describe('resolveMark — glyph', () => {
  it('derives from the title when nothing is set (today’s behaviour)', () => {
    const mark = resolveMark('personal', index(TREE))
    expect(mark.glyph).toBe('house') // areaGlyph('Personal')
    expect(mark.glyphIsOwn).toBe(false)
  })

  it('prefers an explicit glyph over the title', () => {
    const mark = resolveMark(
      'personal',
      index([{ ...TREE[0], glyph: 'tulip-01' }, ...TREE.slice(1)])
    )
    expect(mark.glyph).toBe('tulip-01')
    expect(mark.glyphIsOwn).toBe(true)
  })

  it('keeps an explicit glyph through a rename — the complaint #134 opens with', () => {
    // "renaming an area silently changes its mark". With a choice recorded, the
    // title is never consulted, so the mark holds.
    const renamed = index([{ id: 'personal', parentId: null, title: 'Home Life', glyph: 'house' }])
    expect(resolveMark('personal', renamed).glyph).toBe('house')

    // Without one, it still moves — inherent to deriving from the title, and
    // stated in the spec rather than implied to be solved.
    const derived = index([{ id: 'personal', parentId: null, title: 'Home Life' }])
    expect(resolveMark('personal', derived).glyph).toBeNull()
  })

  it('gives an ordinary page no glyph, so the surface keeps its KindDot', () => {
    expect(resolveMark('pasta', index(TREE)).glyph).toBeNull()
  })

  it('lets a page carry a glyph the picker does not offer', () => {
    // The 140 `asset-N` files are not offered, but a stored one must still render
    // — the library is a picker concern, not a validity rule.
    const mark = resolveMark(
      'pasta',
      index([...TREE.slice(0, 2), { ...TREE[2], glyph: 'asset-113' }])
    )
    expect(mark.glyph).toBe('asset-113')
  })
})

describe('resolveMark — role', () => {
  it('inherits the area’s role, so a whole area reads as one colour', () => {
    const rows = index([{ ...TREE[0], areaRole: 'area-b' }, ...TREE.slice(1)])
    expect(resolveMark('personal', rows).role).toBe('area-b')
    expect(resolveMark('recipes', rows).role).toBe('area-b')
    expect(resolveMark('pasta', rows).role).toBe('area-b')
  })

  it('lets a child override without touching its siblings or its area', () => {
    const rows = index([
      { ...TREE[0], areaRole: 'area-b' },
      { ...TREE[1], areaRole: 'area-c' },
      TREE[2],
      { id: 'trips', parentId: 'personal', title: 'Trips' },
    ])
    expect(resolveMark('recipes', rows).role).toBe('area-c')
    // The override reaches its own children…
    expect(resolveMark('pasta', rows).role).toBe('area-c')
    // …and nothing else.
    expect(resolveMark('trips', rows).role).toBe('area-b')
    expect(resolveMark('personal', rows).role).toBe('area-b')
  })

  it('reports whether the role is the page’s own or inherited', () => {
    const rows = index([{ ...TREE[0], areaRole: 'area-b' }, ...TREE.slice(1)])
    expect(resolveMark('personal', rows).roleIsOwn).toBe(true)
    expect(resolveMark('recipes', rows).roleIsOwn).toBe(false)
  })

  it('derives the whole area from its ROOT when nobody chose', () => {
    const rows = index(TREE)
    const root = derivedRole('personal')
    expect(resolveMark('personal', rows).role).toBe(root)
    expect(resolveMark('recipes', rows).role).toBe(root)
    expect(resolveMark('pasta', rows).role).toBe(root)
  })

  it('ignores a role that is not one the theme defines', () => {
    // The DB CHECK makes this unreachable, but a row from a future migration
    // must not blank the mark.
    const rows = index([{ ...TREE[0], areaRole: 'chartreuse' }, ...TREE.slice(1)])
    expect(AREA_ROLES).toContain(resolveMark('personal', rows).role)
  })

  it('survives a malformed parent cycle instead of looping', () => {
    const rows = index([
      { id: 'a', parentId: 'b', title: 'A' },
      { id: 'b', parentId: 'a', title: 'B' },
    ])
    expect(AREA_ROLES).toContain(resolveMark('a', rows).role)
  })

  it('still returns a mark for a page it has never heard of', () => {
    const mark = resolveMark('ghost', index(TREE))
    expect(mark.glyph).toBeNull()
    expect(mark.role).toBe(derivedRole('ghost'))
  })
})

describe('markIndex', () => {
  it('maps raw rows, treating absent columns as "derive"', () => {
    const map = markIndex([
      { id: 'a', parent_id: null, title: 'A', glyph: 'house', area_role: 'area-c' },
      { id: 'b', parent_id: 'a', title: 'B' },
    ])
    expect(map.get('a')).toEqual({
      id: 'a',
      parentId: null,
      title: 'A',
      glyph: 'house',
      areaRole: 'area-c',
    })
    expect(map.get('b')?.glyph).toBeNull()
    expect(map.get('b')?.areaRole).toBeNull()
  })
})
