/**
 * The ⌘K palette's records source (KAN-77) against a stand-in for the data layer:
 * what it asks Postgres for, how it escapes what was typed, and the sub-line it
 * writes for a title match and for a field match.
 */

import fs from 'node:fs'

import type { SupabaseClient } from '@supabase/supabase-js'

import { escapeLike, matchField, RECORD_LIMIT, searchRecords } from '@/lib/pages/palette-records'
import type { PropertyDef } from '@/lib/properties/schema'
import type { Database } from '@/lib/supabase/types'
import { pondItems } from '@/lib/pages/palette-items'
import type { Pond } from '@/lib/pond/client'

type Op = [method: string, args: unknown[]]
interface Call {
  table: string
  ops: Op[]
}
type Rows = Record<string, unknown>[]

const has = (call: Call, method: string) => call.ops.some(([m]) => m === method)
const arg = (call: Call, method: string): unknown[] =>
  call.ops.find(([m]) => m === method)?.[1] ?? []

class Builder {
  constructor(
    private readonly call: Call,
    private readonly answer: (call: Call) => { data: Rows; error: Error | null }
  ) {}
  in(...a: unknown[]) {
    return this.op('in', ...a)
  }
  private op(method: string, ...args: unknown[]) {
    this.call.ops.push([method, args])
    return this
  }
  select = (...a: unknown[]) => this.op('select', ...a)
  eq = (...a: unknown[]) => this.op('eq', ...a)
  ilike = (...a: unknown[]) => this.op('ilike', ...a)
  order = (...a: unknown[]) => this.op('order', ...a)
  limit = (...a: unknown[]) => this.op('limit', ...a)
  then: PromiseLike<{ data: Rows; error: Error | null }>['then'] = (ok, fail) =>
    Promise.resolve(this.answer(this.call)).then(ok, fail)
}

function fakeSupabase(answer: (call: Call) => { data: Rows; error: Error | null }) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => {
      const call: Call = { table, ops: [] }
      calls.push(call)
      return new Builder(call, answer)
    },
  } as unknown as SupabaseClient<Database>
  return { client, calls }
}

const TASKS_SCHEMA: PropertyDef[] = [
  { id: 'vendor', name: 'vendor', type: 'text' },
  { id: 'stage', name: 'stage', type: 'status', options: [{ id: 'o1', label: 'quoted' }] },
  { id: 'done', name: 'done', type: 'checkbox' },
]
const TASKS = { id: 'tasks', title: 'tasks', props: { _schema: TASKS_SCHEMA } }

const ok = (data: Rows) => ({ data, error: null })

describe('escapeLike — what was typed is a literal, never a pattern', () => {
  it('escapes LIKE’s own characters and neutralises PostgREST’s `*`', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off')
    expect(escapeLike('a\\b')).toBe('a\\\\b')
    expect(escapeLike('a*b')).toBe('a_b')
  })
})

describe('searchRecords', () => {
  it('asks for `row` pages in the active pond, by an escaped title pattern, capped', async () => {
    const { client, calls } = fakeSupabase((call) =>
      has(call, 'in')
        ? ok([TASKS])
        : ok([{ id: 'r1', parent_id: 'tasks', title: 'cabinet quote', props: {} }])
    )
    const items = await searchRecords(client, 'pond-1', '50%_x', 4)
    const titled = calls[0]
    expect(titled.table).toBe('pages')
    expect(titled.ops).toEqual(
      expect.arrayContaining([
        ['eq', ['type', 'row']],
        ['eq', ['pond_id', 'pond-1']],
        ['ilike', ['title', '%50\\%\\_x%']],
        ['limit', [4]],
      ])
    )
    expect(items).toHaveLength(1)
  })

  it('a title match is a record row whose sub is the database', async () => {
    const { client } = fakeSupabase((call) =>
      has(call, 'in')
        ? ok([TASKS])
        : ok([{ id: 'r1', parent_id: 'tasks', title: 'cabinet quote', props: {} }])
    )
    expect(await searchRecords(client, 'p', 'cab')).toEqual([
      { id: 'r1', label: 'cabinet quote', kind: 'record', sub: 'tasks' },
    ])
  })

  it('a field match adds `· field: value` — and a status reads as its option’s label', async () => {
    const { client } = fakeSupabase((call) => {
      if (has(call, 'in')) return ok([TASKS])
      if (has(call, 'ilike')) return ok([])
      return ok([
        { id: 'r2', parent_id: 'tasks', title: 'chase', props: { vendor: 'Acme Cabinets' } },
        { id: 'r3', parent_id: 'tasks', title: 'sand', props: { stage: 'o1' } },
        { id: 'r4', parent_id: 'tasks', title: 'unrelated', props: { vendor: 'other' } },
      ])
    })
    expect(await searchRecords(client, 'p', 'acme')).toEqual([
      { id: 'r2', label: 'chase', kind: 'record', sub: 'tasks · vendor: Acme Cabinets' },
    ])
    expect(await searchRecords(client, 'p', 'quoted')).toEqual([
      { id: 'r3', label: 'sand', kind: 'record', sub: 'tasks · stage: quoted' },
    ])
  })

  it('title matches lead, a row is listed once, and the whole list is capped', async () => {
    const titled = [1, 2].map((n) => ({
      id: `t${n}`,
      parent_id: 'tasks',
      title: `cab ${n}`,
      props: {},
    }))
    const { client, calls } = fakeSupabase((call) => {
      if (has(call, 'in')) return ok([TASKS])
      if (has(call, 'ilike')) return ok(titled)
      return ok([
        ...titled,
        ...[1, 2, 3].map((n) => ({
          id: `f${n}`,
          parent_id: 'tasks',
          title: `other ${n}`,
          props: { vendor: 'cab co' },
        })),
      ])
    })
    const items = await searchRecords(client, 'p', 'cab', 4)
    expect(items.map((i) => i.id)).toEqual(['t1', 't2', 'f1', 'f2'])
    expect(calls.filter((c) => !has(c, 'in') && !has(c, 'ilike'))).toHaveLength(1)
  })

  it('a full page of title matches needs no scan of the pond’s other rows', async () => {
    const titled = Array.from({ length: RECORD_LIMIT }, (_, n) => ({
      id: `t${n}`,
      parent_id: 'tasks',
      title: `cab ${n}`,
      props: {},
    }))
    const { client, calls } = fakeSupabase((call) => (has(call, 'in') ? ok([TASKS]) : ok(titled)))
    expect(await searchRecords(client, 'p', 'cab')).toHaveLength(RECORD_LIMIT)
    expect(calls.filter((c) => has(c, 'ilike') || has(c, 'in'))).toHaveLength(2)
    expect(calls).toHaveLength(2)
    expect(arg(calls[1], 'in')).toEqual(['id', ['tasks']])
  })

  it('a read that fails fails the search, rather than reading as no records', async () => {
    const { client } = fakeSupabase(() => ({ data: [], error: new Error('rls') }))
    await expect(searchRecords(client, 'p', 'cab')).rejects.toThrow('rls')
  })

  it('never touches the page tree’s cache or reads', () => {
    const src = fs.readFileSync('src/lib/pages/palette-records.ts', 'utf8')
    expect(src).not.toMatch(/^import .*(keys|tree)'/m)
  })
})

describe('matchField', () => {
  it('skips checkbox, relation and rollup, and an empty value', () => {
    expect(matchField(TASKS_SCHEMA, { done: true, vendor: null }, 'true')).toBeNull()
    expect(matchField(TASKS_SCHEMA, { vendor: 'acme' }, 'acme')).toEqual({
      name: 'vendor',
      value: 'acme',
    })
  })
})

describe('pondItems — the other ponds, to switch to', () => {
  const pond = (id: string, name: string, glyph: string | null): Pond => ({
    id,
    name,
    glyph,
    theme: 'paper',
    order: 0,
  })
  it('leaves out the pond in view, says `pond · switch`, and carries no ⌘n hint (K1)', () => {
    const items = pondItems(
      [
        pond('a', 'life', 'waves-02'),
        pond('b', 'make noise', 'lightning-03'),
        pond('c', 'x', null),
      ],
      'a'
    )
    expect(items).toEqual([
      { id: 'b', label: 'make noise', kind: 'pond', sub: 'pond · switch', glyph: 'lightning-03' },
      { id: 'c', label: 'x', kind: 'pond', sub: 'pond · switch', glyph: 'waves-02' },
    ])
    expect(items.every((i) => i.key === undefined)).toBe(true)
  })
})
