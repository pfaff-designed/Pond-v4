/**
 * FEATURE — databases, end to end.
 *
 * One file for the whole path a person walks to get a database: a page becomes a
 * collection carrying a property schema, a record lands under it, values arrive
 * typed, records link and a rollup over them recomputes, a view draws them, and
 * the source picker either points at a database that already exists or makes one.
 *
 * These assert the USER-VISIBLE OUTCOME of each path — what is written, what
 * persists, what the next surface reads — never an internal return shape and never
 * appearance (the stories own that). The per-function unit coverage for the same
 * seams lives in `define-schema-from-proposal`, `add-row-from-proposal`,
 * `configure-view-from-proposal`, `link-records-from-proposal`, `compute-rollup`,
 * `property-schema`, `create-database` and `source-databases`.
 *
 * Harness: `createDatabase` runs against the shared `makeFakeSupabase` (#280's own
 * path, unchanged). The accept paths also UPDATE rows — `defineSchema` writes
 * `props`, `saveBlocks` writes `blocks`, `setProperty` writes one value — and the
 * shared fake's builder has no `update`/`order`, so the in-memory table below adds
 * those two call shapes over the SAME `Row` type (the house pattern in
 * `link-records-from-proposal.test.ts`). Extending the shared helper itself would
 * mean editing a file other slices are writing to this week.
 */

import {
  addRowFromProposal,
  defineSchemaFromProposal,
  resolveRowValues,
} from '@/lib/pages/create-page'
import { configureViewFromProposal, type ConfigureViewProposal } from '@/lib/pages/configure-view'
import { linkRecordsFromProposal } from '@/lib/pages/link-records'
import { createDatabase } from '@/lib/pages/create-database'
import { sourceDatabases } from '@/lib/pages/source-databases'
import { DATABASES_ROOT_TITLE, isDatabasesRoot } from '@/lib/pages/databases-root'
import { computeRollup } from '@/lib/modules/view/compute-rollup'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PageRow } from '@/lib/pages/tree'
import {
  PROPERTY_TYPES,
  ROW_TYPE,
  SCHEMA_KEY,
  isCollection,
  readSchema,
  readValues,
  type PropertyDef,
  type PropertySchema,
  type PropertyType,
  type PropertyValue,
} from '@/lib/properties/schema'
import { existingRoot, makeFakeSupabase, type Row } from './helpers/fake-supabase'

const POND = 'pond-1'
const USER = 'user-1'

// ── the in-memory pages table ─────────────────────────────────────────────────

/** A seed row with the boring columns filled in. */
function page(r: Partial<Row> & Pick<Row, 'id'>): Row {
  return {
    user_id: USER,
    pond_id: POND,
    parent_id: null,
    type: 'page',
    title: r.id,
    blocks: [],
    props: {},
    order: 0,
    ...r,
  }
}

/**
 * The query shapes these paths use, over one mutable map: `getPage`
 * (select→eq→maybeSingle), `getChildPages` (select→eq→eq→order), `createPage`
 * (insert→select→single), and the three writes (update→eq). Reads see earlier
 * writes, which is the point — every assertion below reads the stored row back.
 */
function makeDb(seed: Row[]) {
  const pages = new Map<string, Row>(seed.map((r) => [r.id, { ...r }]))
  let seq = 0
  const from = (table: string) => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Record<string, unknown> = {}
    const filters: Array<(r: Row) => boolean> = []
    const source = () => (table === 'pages' ? [...pages.values()] : [])
    const matching = () => source().filter((r) => filters.every((f) => f(r)))
    const settle = () => {
      if (op === 'update') {
        for (const r of matching()) Object.assign(r, payload)
        return { data: null, error: null }
      }
      if (op === 'delete') {
        for (const r of matching()) pages.delete(r.id)
        return { data: null, error: null }
      }
      return { data: [...matching()].sort((a, b) => a.order - b.order), error: null }
    }
    const builder = {
      select: () => builder,
      insert: (p: Record<string, unknown>) => {
        op = 'insert'
        payload = p
        return builder
      },
      update: (p: Record<string, unknown>) => {
        op = 'update'
        payload = p
        return builder
      },
      delete: () => {
        op = 'delete'
        return builder
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
      single: () => {
        const id = `new-${++seq}`
        pages.set(id, page({ ...(payload as Partial<Row>), id, order: seq }))
        return Promise.resolve({ data: { id }, error: null })
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(settle()).then(resolve),
    }
    return builder
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER } } }) },
    from: jest.fn(from),
    /** The stored row, read back after the write under test. */
    row: (id: string) => pages.get(id),
    rows: () => [...pages.values()],
  }
}

const mint = () => {
  let n = 0
  return () => `id-${++n}`
}

// ── 1. define_schema → a collection page carrying its property schema ────────

it('define_schema turns a page into a collection carrying its schema, its ids minted, its existing content untouched', async () => {
  // A plain page that already holds a stray value and a block of its own.
  const db = makeDb([
    page({
      id: 'reading',
      title: 'Reading List',
      blocks: [{ id: 'b-1', type: 'text', content: 'books to get through' }],
      props: { 'legacy-value': 'keep me' },
    }),
  ])

  const { schema } = await defineSchemaFromProposal(
    db as never,
    {
      pageId: 'reading',
      // The model proposes NAMES and types only — never the stable ids a rename
      // relies on.
      schema: [
        { name: 'Author', type: 'text' },
        { name: 'Rating', type: 'number' },
        { name: 'Status', type: 'status', options: [{ label: 'Reading' }, { label: 'Finished' }] },
      ],
    },
    mint()
  )

  const stored = db.row('reading')!
  // The page IS a collection now, and the schema it carries is the one returned.
  expect(isCollection(stored.props)).toBe(true)
  expect(readSchema(stored.props)).toEqual(schema)
  expect(schema.map((d) => [d.name, d.type])).toEqual([
    ['Author', 'text'],
    ['Rating', 'number'],
    ['Status', 'status'],
  ])
  // Every property, and every option, got an id.
  expect(schema.every((d) => !!d.id)).toBe(true)
  expect(schema[2].options?.every((o) => !!o.id)).toBe(true)
  // Becoming a collection is additive: the page keeps its blocks and the values
  // sitting alongside the reserved key. A clobber here would lose row data silently.
  expect(readValues(stored.props)).toEqual({ 'legacy-value': 'keep me' })
  expect(stored.blocks).toEqual([{ id: 'b-1', type: 'text', content: 'books to get through' }])
})

// ── 2. add_row → a record under that collection ──────────────────────────────

it('add_row files a record under the collection, keyed by property id and carrying no schema of its own', async () => {
  const db = makeDb([page({ id: 'reading', title: 'Reading List' })])
  const { schema } = await defineSchemaFromProposal(
    db as never,
    {
      pageId: 'reading',
      schema: [
        { name: 'Author', type: 'text' },
        { name: 'Rating', type: 'number' },
      ],
    },
    mint()
  )
  const byName = (name: string) => schema.find((d) => d.name === name)!.id

  const created = await addRowFromProposal(
    db as never,
    // The model names the properties; it never sees their ids.
    { collectionId: 'reading', title: 'Dune', props: { Author: 'Frank Herbert', Rating: 5 } },
    POND
  )

  const row = db.row(created.id)!
  expect(row.parent_id).toBe('reading')
  expect(row.type).toBe(ROW_TYPE)
  expect(row.title).toBe('Dune')
  expect(row.pond_id).toBe(POND)
  // Values keyed by the schema's stable ids — a rename must never orphan them.
  expect(row.props).toEqual({ [byName('Author')]: 'Frank Herbert', [byName('Rating')]: 5 })
  // A record is NOT itself a collection.
  expect(row.props[SCHEMA_KEY]).toBeUndefined()
  expect(isCollection(row.props)).toBe(false)
})

// ── 3. the 8 property types coerce their values ──────────────────────────────

/**
 * One case per engine property type, keyed BY `PROPERTY_TYPES` so a ninth type
 * arriving in the engine fails this table rather than slipping through untested.
 * Each case gives a value the write seam stores, and a value it must not store as
 * given — the silent half: a wrong-typed value written raw would read back as data.
 */
const COERCION: Record<
  PropertyType,
  { def: PropertyDef; stores: [unknown, PropertyValue]; refuses: [unknown, PropertyValue] }
> = {
  text: {
    def: { id: 'p-text', name: 'Author', type: 'text' },
    stores: ['Frank Herbert', 'Frank Herbert'],
    refuses: [42, null],
  },
  number: {
    def: { id: 'p-num', name: 'Rating', type: 'number' },
    stores: [5, 5],
    refuses: ['five', null],
  },
  date: {
    def: { id: 'p-date', name: 'Finished on', type: 'date' },
    stores: ['2026-10-04', '2026-10-04'],
    refuses: [20261004, null],
  },
  select: {
    def: {
      id: 'p-sel',
      name: 'Shelf',
      type: 'select',
      options: [{ id: 'o-fic', label: 'Fiction' }],
    },
    // The model proposes the LABEL; the stored value is the option's stable id.
    stores: ['fiction', 'o-fic'],
    // Lenient, not destructive: an off-schema choice is kept verbatim rather than
    // dropped, so the person can see what was meant and fix it.
    refuses: ['Poetry', 'Poetry'],
  },
  status: {
    def: {
      id: 'p-stat',
      name: 'Status',
      type: 'status',
      options: [{ id: 'o-read', label: 'Reading' }],
    },
    stores: ['Reading', 'o-read'],
    refuses: ['', null],
  },
  checkbox: {
    def: { id: 'p-check', name: 'Done', type: 'checkbox' },
    stores: [true, true],
    refuses: ['yes', false],
  },
  relation: {
    def: { id: 'p-rel', name: 'Shelf of', type: 'relation' },
    stores: [
      ['row-1', 'row-2'],
      ['row-1', 'row-2'],
    ],
    refuses: ['row-1', []],
  },
  rollup: {
    def: { id: 'p-roll', name: 'Total', type: 'rollup', aggregate: 'sum' },
    // Derived, never stored: a rollup is recomputed on read, so no raw write to
    // its key may ever masquerade as a value.
    stores: [null, null],
    refuses: [42, null],
  },
}

test.each(PROPERTY_TYPES)(
  'a %s value is written typed through the add_row seam, and a value of the wrong shape never lands raw',
  (type) => {
    const { def, stores, refuses } = COERCION[type]
    const schema: PropertySchema = [def]
    expect(resolveRowValues(schema, { [def.name]: stores[0] })).toEqual({ [def.id]: stores[1] })
    expect(resolveRowValues(schema, { [def.name]: refuses[0] })).toEqual({ [def.id]: refuses[1] })
    // A name that is not in the schema is dropped, never written under a made-up key.
    expect(resolveRowValues(schema, { 'Not a property': stores[0] })).toEqual({})
  }
)

// ── 4. a relation links records, and a rollup over them recomputes ───────────

it('linking records writes row ids into the relation, and the rollup over them recomputes', async () => {
  // Books: the target collection, three records carrying a number.
  const booksSchema: PropertySchema = [{ id: 'b-rating', name: 'Rating', type: 'number' }]
  // Shelves: a relation into Books, plus a rollup summing Rating over it.
  const shelvesSchema: PropertySchema = [
    { id: 's-books', name: 'Books', type: 'relation', target: 'books' },
    {
      id: 's-total',
      name: 'Total rating',
      type: 'rollup',
      relationId: 's-books',
      rollupProperty: 'b-rating',
      aggregate: 'sum',
    },
  ]
  const db = makeDb([
    page({ id: 'books', title: 'Books', props: { [SCHEMA_KEY]: booksSchema } }),
    page({
      id: 'dune',
      title: 'Dune',
      parent_id: 'books',
      type: ROW_TYPE,
      props: { 'b-rating': 5 },
      order: 0,
    }),
    page({
      id: 'left-hand',
      title: 'The Left Hand of Darkness',
      parent_id: 'books',
      type: ROW_TYPE,
      props: { 'b-rating': 4 },
      order: 1,
    }),
    page({ id: 'shelves', title: 'Shelves', props: { [SCHEMA_KEY]: shelvesSchema } }),
    page({ id: 'sci-fi', title: 'Sci-fi', parent_id: 'shelves', type: ROW_TYPE, order: 0 }),
  ])
  const rollupDef = shelvesSchema[1]
  const targetRows = () =>
    db.rows().filter((r) => r.parent_id === 'books' && r.type === ROW_TYPE) as Array<{
      id: string
      props: Record<string, unknown>
    }>
  const linked = () => (db.row('sci-fi')!.props['s-books'] as string[] | undefined) ?? []

  // Nothing linked yet: a sum over no records is the identity, not a fake figure.
  expect(computeRollup(rollupDef, linked(), targetRows(), booksSchema)).toEqual({
    kind: 'number',
    value: 0,
  })

  // The model names the rows by TITLE; accept resolves them to ids.
  await linkRecordsFromProposal(
    db as never,
    { collectionId: 'shelves', fromRow: 'Sci-fi', relation: 'Books', toRows: ['Dune'] },
    POND
  )
  expect(linked()).toEqual(['dune'])
  expect(computeRollup(rollupDef, linked(), targetRows(), booksSchema)).toEqual({
    kind: 'number',
    value: 5,
  })

  // A second link appends (and re-linking Dune is a no-op), and the rollup follows.
  await linkRecordsFromProposal(
    db as never,
    {
      collectionId: 'shelves',
      fromRow: 'Sci-fi',
      relation: 'Books',
      toRows: ['The Left Hand of Darkness', 'Dune'],
    },
    POND
  )
  expect(linked()).toEqual(['dune', 'left-hand'])
  expect(computeRollup(rollupDef, linked(), targetRows(), booksSchema)).toEqual({
    kind: 'number',
    value: 9,
  })
  // The relation stores IDS, never the titles the model proposed — a title written
  // here would dangle the moment someone renamed the book.
  expect(linked()).not.toContain('Dune')
  // And the rollup is never persisted: it is recomputed from the records on read.
  expect(db.row('sci-fi')!.props['s-total']).toBeUndefined()
})

// ── 5. configure_view → table / gallery / chart / big-number ─────────────────

const VIEW_SCHEMA: PropertySchema = [
  { id: 'p-rating', name: 'Rating', type: 'number' },
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-read', label: 'Reading' },
      { id: 'o-done', label: 'Finished' },
    ],
  },
]

/** Each mode, configured by property NAME, with the block the collection ends up
 *  carrying — every reference resolved to a stable id, and no data of its own. */
const VIEW_CASES: Array<
  [ConfigureViewProposal['mode'], Partial<ConfigureViewProposal>, ViewBlock]
> = [
  [
    'table',
    { sort: { key: 'Rating', dir: 'desc' } },
    { id: 'id-1', type: 'view', mode: 'table', sort: { key: 'p-rating', dir: 'desc' } },
  ],
  [
    'gallery',
    { filter: { property: 'Status', op: 'eq', value: 'Reading' } },
    {
      id: 'id-1',
      type: 'view',
      mode: 'gallery',
      // The filter's VALUE resolves label→option id too, or it would match nothing.
      filter: { property: 'p-status', op: 'eq', value: 'o-read' },
    },
  ],
  [
    'chart',
    { chart: { kind: 'bar', xProperty: 'Status', series: [{ property: 'Rating', agg: 'sum' }] } },
    {
      id: 'id-1',
      type: 'view',
      mode: 'chart',
      chart: { kind: 'bar', xProperty: 'p-status', series: [{ property: 'p-rating', agg: 'sum' }] },
    },
  ],
  [
    'big-number',
    { bigNumber: { property: 'Rating', agg: 'avg', format: 'number' } },
    {
      id: 'id-1',
      type: 'view',
      mode: 'big-number',
      bigNumber: { property: 'p-rating', agg: 'avg', format: 'number' },
    },
  ],
]

test.each(VIEW_CASES)(
  'configure_view gives the collection one %s view, its property names resolved to ids and no data of its own',
  async (mode, extras, expected) => {
    const db = makeDb([
      page({ id: 'reading', title: 'Reading List', props: { [SCHEMA_KEY]: VIEW_SCHEMA } }),
    ])

    const out = await configureViewFromProposal(
      db as never,
      { pageId: 'reading', mode, ...extras },
      mint()
    )

    expect(out).toEqual({ id: 'reading', replaced: false })
    const stored = db.row('reading')!
    // Exactly ONE view block: a collection shows one active view at a time.
    expect(stored.blocks).toEqual([expected])
    // Configuring a view never touches the schema it draws.
    expect(readSchema(stored.props)).toEqual(VIEW_SCHEMA)
  }
)

// ── 6. the source picker — pick an existing database, or make a new one ──────

it('the source picker lists the pond’s existing databases with their record counts', () => {
  // The picker is handed the flat pages tree; `Pond 02` 2e: anything already in
  // databases is one row down.
  const row = (p: Partial<PageRow> & Pick<PageRow, 'id' | 'title'>): PageRow => ({
    parent_id: null,
    type: 'page',
    order: 0,
    updated_at: '2026-10-04T00:00:00Z',
    ...p,
  })
  const tree: PageRow[] = [
    row({ id: 'life', title: 'life' }),
    row({ id: 'root', title: DATABASES_ROOT_TITLE, order: 9 }),
    row({ id: 'recipes', title: 'recipes', parent_id: 'root', order: 1 }),
    row({ id: 'calories', title: 'calories', parent_id: 'root', order: 0 }),
    // A page under life is NOT a database — the two roots are peers.
    row({ id: 'kitchen', title: 'kitchen renovation', parent_id: 'life' }),
  ]

  expect(sourceDatabases(tree, new Map([['calories', 412]]))).toEqual([
    { id: 'calories', title: 'calories', records: 412, recordsAre: 'pages' },
    // Uncounted means empty, not unknown.
    { id: 'recipes', title: 'recipes', records: 0, recordsAre: 'pages' },
  ])
})

it('making a new database files a collection under databases and hands the host page a view of it', async () => {
  // A root already holding a sibling named "calories" — the picker names a new
  // database after its host page, so this is the collision KAN-300 removes: the
  // free title is picked before the first insert, not after a 409.
  const sb = makeFakeSupabase([
    { ...existingRoot, pond_id: POND },
    page({ id: 'db-calories', parent_id: 'root-db', title: 'calories' }),
  ])
  const schema: PropertySchema = [
    { id: 'f-day', name: 'day', type: 'date' },
    { id: 'f-kcal', name: 'kcal', type: 'number' },
  ]

  const made = await createDatabase(
    sb as never,
    {
      title: 'calories',
      schema,
      mode: 'chart',
      chart: { kind: 'line', xProperty: 'f-day', series: [{ property: 'f-kcal', agg: 'sum' }] },
      pondId: POND,
    },
    mint()
  )

  // Filed under the existing databases root — this call did not create one.
  const root = sb._pages.get(made.databasesRootId)!
  expect(isDatabasesRoot({ parentId: root.parent_id, title: root.title })).toBe(true)
  expect(made.rootCreated).toBe(false)
  // Exactly one insert: the free title was picked before writing, not after a
  // 23505 round trip.
  expect(sb._inserts).toBe(1)
  const database = sb._pages.get(made.databaseId)!
  expect(database.parent_id).toBe(made.databasesRootId)
  expect(database.title).toBe('calories 2')
  expect(readSchema(database.props)).toEqual(schema)
  // Empty until the person adds a record.
  expect([...sb._pages.values()].filter((p) => p.parent_id === made.databaseId)).toEqual([])
  // The host page gets a LINKED view of it, carrying the chosen mode and both
  // field ids — a chart config naming no fields draws a flat line of record titles.
  expect(made.view).toEqual({
    id: expect.any(String),
    type: 'view',
    mode: 'chart',
    collectionId: made.databaseId,
    chart: { kind: 'line', xProperty: 'f-day', series: [{ property: 'f-kcal', agg: 'sum' }] },
  })
})
