/**
 * A page's mark — src/lib/pages/mark.ts (issue #134).
 *
 * The contract this pins is the inheritance rule, because three surfaces render
 * the same mark and a disagreement between them is the bug this module exists to
 * make impossible:
 *
 *   - an explicit choice wins, and survives a rename (the original complaint);
 *   - a page with no role of its own takes its AREA's, so "a whole area reads as
 *     one hue" once someone has coloured it;
 *   - nobody chose, nothing is assigned: the role is null and the mark is ink;
 *   - nothing anywhere resolves to a colour — only to a role.
 */

import { markIndex, resolveMark, type MarkSource } from '@/lib/pages/mark'
import { setPageMark } from '@/lib/pages/client'

function index(rows: MarkSource[]): Map<string, MarkSource> {
  return new Map(rows.map((r) => [r.id, r]))
}

/** Personal (an area) → Recipes → Pasta. */
const TREE: MarkSource[] = [
  { id: 'personal', parentId: null, title: 'Personal' },
  { id: 'recipes', parentId: 'personal', title: 'Recipes' },
  { id: 'pasta', parentId: 'recipes', title: 'Pasta' },
]

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

  it('is ink — a null role — wherever nobody chose a colour', () => {
    const rows = index(TREE)
    for (const id of ['personal', 'recipes', 'pasta']) {
      const mark = resolveMark(id, rows)
      expect(mark.role).toBeNull()
      expect(mark.roleIsOwn).toBe(false)
    }
  })

  it('ignores a role that is not one the theme defines', () => {
    // The DB CHECK makes this unreachable, but a row from a future migration
    // must not blank the mark.
    const rows = index([{ ...TREE[0], areaRole: 'chartreuse' }, ...TREE.slice(1)])
    expect(resolveMark('personal', rows).role).toBeNull()
  })

  it('survives a malformed parent cycle instead of looping', () => {
    const rows = index([
      { id: 'a', parentId: 'b', title: 'A' },
      { id: 'b', parentId: 'a', title: 'B' },
    ])
    expect(resolveMark('a', rows).role).toBeNull()
  })

  it('still returns a mark for a page it has never heard of', () => {
    const mark = resolveMark('ghost', index(TREE))
    expect(mark.glyph).toBeNull()
    expect(mark.role).toBeNull()
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

// ── The write path ───────────────────────────────────────────────────────────

describe('setPageMark', () => {
  function fakeSupabase() {
    const captured: { patch?: Record<string, unknown>; id?: string } = {}
    const chain = {
      update(patch: Record<string, unknown>) {
        captured.patch = patch
        return chain
      },
      eq(_col: string, id: string) {
        captured.id = id
        return Promise.resolve({ error: null })
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { supabase: { from: () => chain } as any, captured }
  }

  it('does NOT stamp updated_at — a mark is not a content edit', async () => {
    // Pinned because a reviewer already asked for the stamp once, on the grounds
    // that every other `pages` write has it. Those writes change content
    // (`blocks`) or the name (`title`); a mark is neither. Nothing sorts by
    // `updated_at`, and its one reader feeds the overview cards' "updated …"
    // caption — so stamping it made picking a COLOUR read as an edit to the page
    // and to every ancestor, with no change-log record behind the claim.
    const { supabase, captured } = fakeSupabase()
    await setPageMark(supabase, 'p1', { glyph: 'tulip-01' })
    expect(captured.patch).toEqual({ glyph: 'tulip-01' })
    expect(captured.patch).not.toHaveProperty('updated_at')
  })

  it('writes only the half it was given, and clears with null', async () => {
    // Tri-state on purpose: absent leaves the column alone, null resets it to
    // derive/inherit. That is what lets the picker offer "reset" per half without
    // a second verb, and stops choosing a glyph stamping a colour nobody picked.
    const a = fakeSupabase()
    await setPageMark(a.supabase, 'p1', { areaRole: null })
    expect(a.captured.patch).toEqual({ area_role: null })

    const b = fakeSupabase()
    await setPageMark(b.supabase, 'p1', { glyph: 'moon', areaRole: 'area-c' })
    expect(b.captured.patch).toEqual({ glyph: 'moon', area_role: 'area-c' })
  })

  it('writes nothing at all when handed an empty patch', async () => {
    const { supabase, captured } = fakeSupabase()
    await setPageMark(supabase, 'p1', {})
    expect(captured.patch).toBeUndefined()
  })
})
