/**
 * A page's mark — src/lib/pages/mark.ts.
 *
 *   - An area is a top-level page that is neither the home row nor the databases
 *     root. Only an area takes a colour; every page takes its area's.
 *   - Ink is the default and means no colour. Pond never assigns one.
 *   - A page's automatic mark is its kind dot; an area's is a glyph derived from
 *     its title, which follows a rename. An explicit glyph does not.
 *   - Navy draws as mist on the dark ground; the stored role stays navy.
 *
 * Nothing here resolves to a colour — only to a role the theme paints.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { markIndex, resolveMark, type MarkSource } from '@/lib/pages/mark'
import { NotAnAreaError, setAreaRole, setPageGlyph } from '@/lib/pages/mark-client'
import { areaGlyph } from '@/lib/rail/area-glyph'

const index = (rows: MarkSource[]): Map<string, MarkSource> => new Map(rows.map((r) => [r.id, r]))

/** Health (an area) → Training → Workouts; Money (an area) → Budget. */
const HEALTH: MarkSource = { id: 'health', parentId: null, title: 'Health', areaRole: 'area-a' }
const TRAINING: MarkSource = { id: 'training', parentId: 'health', title: 'Training' }
const WORKOUTS: MarkSource = { id: 'workouts', parentId: 'training', title: 'Workouts' }
const MONEY: MarkSource = { id: 'money', parentId: null, title: 'Money', areaRole: 'area-c' }
const BUDGET: MarkSource = { id: 'budget', parentId: 'money', title: 'Budget' }
const TREE = [HEALTH, TRAINING, WORKOUTS, MONEY, BUDGET]

describe('resolveMark — colour belongs to areas', () => {
  it('a page under a sage area is sage even if its stored role says navy', () => {
    const rows = index([HEALTH, TRAINING, { ...WORKOUTS, areaRole: 'area-c' }, MONEY, BUDGET])
    expect(resolveMark('workouts', rows).role).toBe('area-a')
    expect(resolveMark('training', rows).role).toBe('area-a')
  })

  it('an area with no role is ink, and so is every page inside it', () => {
    const rows = index([{ ...HEALTH, areaRole: null }, TRAINING, WORKOUTS])
    expect(resolveMark('health', rows).role).toBeNull()
    expect(resolveMark('workouts', rows).role).toBeNull()
  })

  it('a page with a stored role under an ink area is still ink', () => {
    const rows = index([
      { ...HEALTH, areaRole: null },
      { ...TRAINING, areaRole: 'area-b' },
    ])
    expect(resolveMark('training', rows).role).toBeNull()
  })

  it('moving a page between areas changes its colour, with nothing written to it', () => {
    expect(resolveMark('workouts', index(TREE)).role).toBe('area-a')
    const moved = index([HEALTH, TRAINING, { ...WORKOUTS, parentId: 'money' }, MONEY, BUDGET])
    expect(resolveMark('workouts', moved).role).toBe('area-c')
  })

  it('an area’s colour is its own role', () => {
    expect(resolveMark('health', index(TREE)).role).toBe('area-a')
    expect(resolveMark('money', index(TREE)).role).toBe('area-c')
  })

  it('says which marks are areas — the only ones that take a colour', () => {
    const rows = index(TREE)
    expect(resolveMark('health', rows).isArea).toBe(true)
    expect(resolveMark('training', rows).isArea).toBe(false)
    expect(resolveMark('workouts', rows).isArea).toBe(false)
  })

  it('the databases root is not an area: it and its pages stay ink', () => {
    const rows = index([
      { id: 'db-root', parentId: null, title: 'databases', areaRole: 'area-a' },
      { id: 'ingredients', parentId: 'db-root', title: 'ingredients' },
    ])
    expect(resolveMark('db-root', rows)).toMatchObject({ isArea: false, role: null, glyph: null })
    expect(resolveMark('ingredients', rows).role).toBeNull()
  })

  it('the home row is not an area: no colour, no automatic glyph', () => {
    const home: MarkSource = {
      id: 'home',
      parentId: null,
      type: 'home',
      title: 'life',
      areaRole: 'area-a',
    }
    expect(resolveMark('home', index([]), home)).toEqual({
      glyph: null,
      role: null,
      isArea: false,
      glyphIsOwn: false,
    })
  })

  it('a top-level page with no type recorded is still an area', () => {
    expect(resolveMark('health', index([HEALTH])).isArea).toBe(true)
    expect(resolveMark('health', index([{ ...HEALTH, type: 'page' }])).isArea).toBe(true)
  })

  it('a page whose area is not in the index is ink, not a guess', () => {
    expect(resolveMark('workouts', index([WORKOUTS])).role).toBeNull()
  })

  it('ignores a role that is not one the theme defines', () => {
    expect(resolveMark('health', index([{ ...HEALTH, areaRole: 'chartreuse' }])).role).toBeNull()
  })

  it('survives a malformed parent cycle instead of looping', () => {
    const rows = index([
      { id: 'a', parentId: 'b', title: 'A' },
      { id: 'b', parentId: 'a', title: 'B' },
    ])
    expect(resolveMark('a', rows).role).toBeNull()
  })
})

describe('resolveMark — glyph', () => {
  it('a page’s automatic mark is its kind dot (no glyph)', () => {
    const mark = resolveMark('workouts', index(TREE))
    expect(mark.glyph).toBeNull()
    expect(mark.glyphIsOwn).toBe(false)
  })

  it('a nested page titled like a seeded area still gets its kind dot', () => {
    const rows = index([HEALTH, { id: 'h2', parentId: 'health', title: 'Personal' }])
    expect(resolveMark('h2', rows).glyph).toBeNull()
  })

  it('a chosen glyph takes the dot’s place, and any of the 182 will do', () => {
    const mark = resolveMark(
      'workouts',
      index([HEALTH, TRAINING, { ...WORKOUTS, glyph: 'asset-113' }])
    )
    expect(mark.glyph).toBe('asset-113')
    expect(mark.glyphIsOwn).toBe(true)
  })

  it('an area’s automatic glyph is derived from its title', () => {
    expect(resolveMark('health', index(TREE)).glyph).toBe('heart')
    const food = resolveMark('food', index([{ id: 'food', parentId: null, title: 'Food' }]))
    expect(food.glyph).toBe(areaGlyph('Food'))
    expect(food.glyphIsOwn).toBe(false)
  })

  it('renaming an area changes its automatic glyph', () => {
    const before = resolveMark('health', index([HEALTH])).glyph
    const after = resolveMark('health', index([{ ...HEALTH, title: 'Personal' }])).glyph
    expect(before).toBe('heart')
    expect(after).toBe('house')
  })

  it('renaming an area with an explicit glyph does not', () => {
    const chosen = { ...HEALTH, glyph: 'tulip-01' }
    expect(resolveMark('health', index([chosen])).glyph).toBe('tulip-01')
    expect(resolveMark('health', index([{ ...chosen, title: 'Personal' }])).glyph).toBe('tulip-01')
  })

  it('uses the fallback for a page the index does not hold', () => {
    const mark = resolveMark('scratch', index([]), {
      id: 'scratch',
      parentId: null,
      title: 'Health',
    })
    expect(mark).toMatchObject({ glyph: 'heart', isArea: true, role: null })
  })

  it('still returns a mark for a page it has never heard of', () => {
    expect(resolveMark('ghost', index(TREE))).toEqual({
      glyph: null,
      role: null,
      isArea: false,
      glyphIsOwn: false,
    })
  })
})

describe('markIndex', () => {
  it('maps raw rows, treating absent columns as automatic', () => {
    const map = markIndex([
      { id: 'a', parent_id: null, type: 'page', title: 'A', glyph: 'house', area_role: 'area-c' },
      { id: 'b', parent_id: 'a', title: 'B' },
    ])
    expect(map.get('a')).toEqual({
      id: 'a',
      parentId: null,
      type: 'page',
      title: 'A',
      glyph: 'house',
      areaRole: 'area-c',
    })
    expect(map.get('b')?.type).toBeUndefined()
    expect(map.get('b')?.glyph).toBeNull()
    expect(map.get('b')?.areaRole).toBeNull()
  })
})

// ── Navy on ink ─────────────────────────────────────────────────────────────

describe('area roles across themes', () => {
  const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8')
  const block = (selector: string): string => {
    const match = css.match(
      new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm')
    )
    if (!match) throw new Error(`no ${selector} block`)
    return match[1]
  }
  const role = (body: string, name: string): string | undefined =>
    body.match(new RegExp(`--mn-${name}:\\s*([^;]+);`))?.[1].trim()

  it('navy draws as mist on the dark ground; the stored role stays navy', () => {
    expect(role(block(':root'), 'area-c')).toBe('var(--raw-navy)')
    expect(role(block('.dark'), 'area-c')).toBe('var(--raw-mist)')
  })

  it('sage and mist are the same on both grounds', () => {
    for (const body of [block(':root'), block('.dark')]) {
      expect(role(body, 'area-a')).toBe('var(--raw-sage)')
      expect(role(body, 'area-b')).toBe('var(--raw-mist)')
    }
  })
})

// ── The write path ───────────────────────────────────────────────────────────

interface Row {
  id: string
  parent_id: string | null
  type: string
  title: string
}

interface Captured {
  patch?: Record<string, unknown>
  filters: string[]
}

/**
 * A pages update chain over `rows` that applies the filters it is given the way
 * PostgREST would, so a write that names a page it may not touch matches nothing.
 * `error` stands in for a database error, e.g. a CHECK violation.
 */
const fakeSupabase = (rows: Row[] = [], error: { code: string; message: string } | null = null) => {
  const captured: Captured = { filters: [] }
  let matched = rows
  const filter = (label: string, keep: (r: Row) => boolean) => {
    captured.filters.push(label)
    matched = matched.filter(keep)
  }
  const result = () => ({ data: error ? null : matched.map((r) => ({ id: r.id })), error })
  const chain = {
    update(patch: Record<string, unknown>) {
      captured.patch = patch
      return chain
    },
    eq(col: keyof Row, value: string) {
      filter(`eq ${col} ${value}`, (r) => r[col] === value)
      return Object.assign(Promise.resolve(result()), chain)
    },
    is(col: keyof Row, value: null) {
      filter(`is ${col} ${value}`, (r) => r[col] === value)
      return chain
    },
    neq(col: keyof Row, value: string) {
      filter(`neq ${col} ${value}`, (r) => r[col] !== value)
      return chain
    },
    not(col: keyof Row, op: 'ilike', value: string) {
      filter(`not ${col} ${op} ${value}`, (r) => String(r[col]).toLowerCase() !== value)
      return chain
    },
    select() {
      return Promise.resolve(result())
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: () => chain } as any, captured }
}

const AREA_ROW: Row = { id: 'health', parent_id: null, type: 'page', title: 'Health' }

describe('setPageGlyph', () => {
  it('writes the glyph and nothing else — no colour, no updated_at', async () => {
    const { supabase, captured } = fakeSupabase([AREA_ROW])
    await setPageGlyph(supabase, 'health', 'tulip-01')
    expect(captured.patch).toEqual({ glyph: 'tulip-01' })
    expect(captured.filters).toEqual(['eq id health'])
  })

  it('null puts the automatic mark back', async () => {
    const { supabase, captured } = fakeSupabase([AREA_ROW])
    await setPageGlyph(supabase, 'health', null)
    expect(captured.patch).toEqual({ glyph: null })
  })
})

describe('setAreaRole', () => {
  it('writes the role to an area', async () => {
    const { supabase, captured } = fakeSupabase([AREA_ROW])
    await setAreaRole(supabase, 'health', 'area-c')
    expect(captured.patch).toEqual({ area_role: 'area-c' })
  })

  it('null puts an area back to ink', async () => {
    const { supabase, captured } = fakeSupabase([AREA_ROW])
    await setAreaRole(supabase, 'health', null)
    expect(captured.patch).toEqual({ area_role: null })
  })

  it('refuses a nested page', async () => {
    const { supabase } = fakeSupabase([{ ...AREA_ROW, id: 'sleep', parent_id: 'health' }])
    await expect(setAreaRole(supabase, 'sleep', 'area-a')).rejects.toBeInstanceOf(NotAnAreaError)
  })

  it('refuses the home row', async () => {
    const { supabase } = fakeSupabase([
      { id: 'home', parent_id: null, type: 'home', title: 'life' },
    ])
    await expect(setAreaRole(supabase, 'home', 'area-a')).rejects.toBeInstanceOf(NotAnAreaError)
  })

  it('refuses the databases root, whatever its casing', async () => {
    const { supabase } = fakeSupabase([
      { id: 'db', parent_id: null, type: 'page', title: 'Databases' },
    ])
    await expect(setAreaRole(supabase, 'db', 'area-a')).rejects.toBeInstanceOf(NotAnAreaError)
  })

  it('reports the database’s area CHECK as the same refusal', async () => {
    const { supabase } = fakeSupabase([AREA_ROW], {
      code: '23514',
      message: 'violates check constraint "pages_area_role_area_only"',
    })
    await expect(setAreaRole(supabase, 'health', 'area-a')).rejects.toBeInstanceOf(NotAnAreaError)
  })

  it('passes any other database error through', async () => {
    const { supabase } = fakeSupabase([AREA_ROW], { code: '42501', message: 'denied' })
    await expect(setAreaRole(supabase, 'health', 'area-a')).rejects.toMatchObject({
      code: '42501',
    })
  })
})
