/**
 * `createDatabase` (#280) — the engine under the source picker's `new` step, and
 * the sequence `createDatabaseFromList` (#101) now composes: the databases root
 * (created on first use), a collection page under it carrying the schema, and
 * the `view` block the host page inserts. Runs against the shared fake Supabase.
 */

import { createDatabase, rollbackDatabase } from '@/lib/pages/create-database'
import { createDatabaseFromList } from '@/lib/pages/list-to-table'
import { isDatabasesRoot } from '@/lib/pages/databases-root'
import { readSchema, SCHEMA_KEY, type PropertySchema } from '@/lib/properties/schema'
import type { TextBlock } from '@/lib/modules/text/schema'
import { existingRoot, makeFakeSupabase } from './helpers/fake-supabase'

function counter() {
  let n = 0
  return () => `id-${++n}`
}

const TITLE_ONLY: PropertySchema = [{ id: 'p-title', name: 'title', type: 'text' }]

describe('createDatabase', () => {
  it('files a collection page carrying the schema under the databases root and returns a table view of it', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const made = await createDatabase(
      sb as never,
      { title: 'recipes', schema: TITLE_ONLY, pondId: null },
      counter()
    )

    const database = sb._pages.get(made.databaseId)!
    expect(database.parent_id).toBe('root-db')
    expect(database.type).toBe('page')
    expect(database.title).toBe('recipes')
    expect(readSchema(database.props)).toEqual(TITLE_ONLY)
    expect(made.databasesRootId).toBe('root-db')
    expect(made.rootCreated).toBe(false)
    expect(made.view).toEqual({
      id: expect.any(String),
      type: 'view',
      mode: 'table',
      collectionId: made.databaseId,
    })
    // No records: the page is empty until the person adds one through the view.
    expect([...sb._pages.values()].filter((p) => p.parent_id === made.databaseId)).toHaveLength(0)
  })

  it('creates the databases root on first use and says so', async () => {
    const sb = makeFakeSupabase([])
    const made = await createDatabase(
      sb as never,
      { title: 'recipes', schema: TITLE_ONLY, pondId: null },
      counter()
    )
    const root = sb._pages.get(made.databasesRootId)!
    expect(isDatabasesRoot({ parentId: root.parent_id, title: root.title })).toBe(true)
    expect(made.rootCreated).toBe(true)
    expect(sb._pages.get(made.databaseId)!.parent_id).toBe(root.id)
  })

  it('makes the view in the mode the picker chose, carrying a chart kind when there is one', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const gallery = await createDatabase(
      sb as never,
      { title: 'recipes', schema: TITLE_ONLY, mode: 'gallery', pondId: null },
      counter()
    )
    expect(gallery.view.mode).toBe('gallery')
    expect(gallery.view.chart).toBeUndefined()

    const chart = await createDatabase(
      sb as never,
      {
        title: 'calories',
        schema: TITLE_ONLY,
        mode: 'chart',
        chart: { kind: 'line', xProperty: 'f-day', series: [{ property: 'f-kcal', agg: 'sum' }] },
        pondId: null,
      },
      counter()
    )
    expect(chart.view.mode).toBe('chart')
    expect(chart.view.chart?.kind).toBe('line')
    // The config names BOTH fields. `resolveChartConfig` infers an x axis only
    // when there is no stored config at all, and a series of `{property: '',
    // agg: 'count'}` plots a constant 1 — so a config carrying the kind alone,
    // or an empty count series, would make the chart a flat line against record
    // titles whatever the picker's row promised.
    expect(chart.view.chart?.xProperty).toBe('f-day')
    expect(chart.view.chart?.series).toEqual([{ property: 'f-kcal', agg: 'sum' }])
  })

  it('writes nothing when unauthenticated', async () => {
    const sb = makeFakeSupabase([existingRoot])
    sb.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(
      createDatabase(sb as never, { title: 'recipes', schema: TITLE_ONLY, pondId: null }, counter())
    ).rejects.toThrow('Not authenticated')
    expect(sb._pages.size).toBe(1)
  })

  it('a failure after a fresh root was made removes that root again — never an older one', async () => {
    // Insert 1 is the root, insert 2 (the database) fails.
    const fresh = makeFakeSupabase([], 2)
    await expect(
      createDatabase(
        fresh as never,
        { title: 'recipes', schema: TITLE_ONLY, pondId: null },
        counter()
      )
    ).rejects.toThrow('connection failure')
    expect(fresh._pages.size).toBe(0)

    const older = makeFakeSupabase([existingRoot], 1)
    await expect(
      createDatabase(
        older as never,
        { title: 'recipes', schema: TITLE_ONLY, pondId: null },
        counter()
      )
    ).rejects.toThrow('connection failure')
    expect(older._pages.has('root-db')).toBe(true)
  })

  it('rollbackDatabase swallows its own errors so the caller’s failure is the one raised', async () => {
    const sb = makeFakeSupabase([existingRoot])
    await expect(rollbackDatabase(sb as never, 'missing', null)).resolves.toBeUndefined()
    expect(sb._pages.has('root-db')).toBe(true)
  })
})

describe('createDatabaseFromList composes createDatabase (#101 on #280)', () => {
  const ingredients: TextBlock = {
    id: 'b-list',
    type: 'text',
    content: '- 500g strong white flour\n- 350g water',
  }

  it('still files the database under the root, adds the rows, and returns the same view shape', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const made = await createDatabaseFromList(
      sb as never,
      { block: ingredients, title: 'ingredients', pondId: null },
      counter()
    )
    expect(sb._pages.get(made.databaseId)!.parent_id).toBe('root-db')
    expect(made.rowCount).toBe(2)
    expect(made.view).toEqual({
      id: expect.any(String),
      type: 'view',
      mode: 'table',
      collectionId: made.databaseId,
    })
    const rows = [...sb._pages.values()].filter((p) => p.parent_id === made.databaseId)
    expect(rows).toHaveLength(2)
    for (const r of rows) expect(r.props[SCHEMA_KEY]).toBeUndefined()
  })

  it('a failure while adding rows rolls the database back, and the root only when this call made it', async () => {
    // Inserts: 1 root, 2 database, 3 first row (fails).
    const sb = makeFakeSupabase([], 3)
    await expect(
      createDatabaseFromList(
        sb as never,
        { block: ingredients, title: 'ingredients', pondId: null },
        counter()
      )
    ).rejects.toThrow('connection failure')
    expect(sb._pages.size).toBe(0)
  })
})
