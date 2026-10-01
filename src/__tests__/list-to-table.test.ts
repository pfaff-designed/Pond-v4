/**
 * Tests for the user's own list → table gesture (#101, board 6j).
 *
 * The handle menu's "turn into › table" turns a list block into a table. Per
 * PROJECT_RULES ("a table is always a view of a database") and AUDIT § Decided
 * 26 sep (6j) that CREATES a real database from the list's rows, filed under the
 * `databases` root, and the block becomes a view of it. Pure helpers (list
 * detection, the amount·unit·thing column inference, the menu preview count) are
 * exercised directly; the orchestrator runs against an in-memory fake Supabase.
 * Field types come from promote-table's existing inference, so every inferred
 * type is one of the 8 property types in `properties/schema.ts`.
 */

import {
  listItems,
  inferListTable,
  previewListTable,
  inferListDatabaseTitle,
  createDatabaseFromList,
} from '@/lib/pages/list-to-table'
import {
  inferColumnType,
  replaceBlockWithView,
  tableRowsToPageInputs,
} from '@/lib/pages/promote-table'
import {
  DATABASES_ROOT_TITLE,
  getOrCreateDatabasesRoot,
  isDatabasesRoot,
  withoutDatabasesRoot,
} from '@/lib/pages/databases-root'
import { PROPERTY_TYPES, ROW_TYPE, SCHEMA_KEY, readSchema } from '@/lib/properties/schema'
import type { TextBlock } from '@/lib/modules/text/schema'

function counter() {
  let n = 0
  return () => `id-${++n}`
}

const ingredients: TextBlock = {
  id: 'b-list',
  type: 'text',
  content: '- 500g strong white flour\n- 350g water\n- 100g levain\n- 10g salt',
}

// ── listItems — what counts as a list (AC1) ──────────────────────────────────

describe('listItems', () => {
  it('reads a markdown bullet list into its items', () => {
    expect(listItems(ingredients)).toEqual([
      '500g strong white flour',
      '350g water',
      '100g levain',
      '10g salt',
    ])
  })

  it('accepts *, + and numbered markers, ignoring blank lines', () => {
    const block: TextBlock = {
      id: 'b',
      type: 'text',
      content: '* one\n\n+ two\n1. three\n2) four\n',
    }
    expect(listItems(block)).toEqual(['one', 'two', 'three', 'four'])
  })

  it('returns null for prose, a heading, an empty block, or a mixed block', () => {
    const text = (content: string): TextBlock => ({ id: 'b', type: 'text', content })
    expect(listItems(text('Just a paragraph'))).toBeNull()
    expect(listItems(text('## ingredients'))).toBeNull()
    expect(listItems(text(''))).toBeNull()
    expect(listItems(text('ingredients\n- 500g flour'))).toBeNull()
  })

  it('returns null for a non-text block', () => {
    expect(listItems({ id: 'b', type: 'table', columns: ['A'], rows: [] })).toBeNull()
  })
})

// ── inferListTable — columns from the pattern in the lines (6j frame 3) ──────

describe('inferListTable', () => {
  it('reads "an amount, a unit and a thing" into amount · unit · item columns', () => {
    expect(inferListTable(listItems(ingredients)!)).toEqual({
      columns: ['amount', 'unit', 'item'],
      rows: [
        ['500', 'g', 'strong white flour'],
        ['350', 'g', 'water'],
        ['100', 'g', 'levain'],
        ['10', 'g', 'salt'],
      ],
    })
  })

  it("keeps a non-matching line's text in the last column (nothing lost)", () => {
    const { columns, rows } = inferListTable(['500g flour', '2 eggs', 'a pinch of saffron'])
    expect(columns).toEqual(['amount', 'unit', 'item'])
    expect(rows).toEqual([
      ['500', 'g', 'flour'],
      ['2', '', 'eggs'],
      ['', '', 'a pinch of saffron'],
    ])
  })

  it('drops the unit column when no line carries a unit', () => {
    expect(inferListTable(['3 chairs', '1 table', '12 forks'])).toEqual({
      columns: ['amount', 'item'],
      rows: [
        ['3', 'chairs'],
        ['1', 'table'],
        ['12', 'forks'],
      ],
    })
  })

  it('only takes a spaced unit from the known unit words, never the thing itself', () => {
    const { rows } = inferListTable(['2 cups rice', '2 eggs large'])
    expect(rows).toEqual([
      ['2', 'cups', 'rice'],
      ['2', '', 'eggs large'],
    ])
  })

  it('normalises a comma decimal separator so the amount column still types as a number', () => {
    const { columns, rows } = inferListTable(['1,5 l milk', '2,25 kg flour', '3 eggs'])
    expect(columns).toEqual(['amount', 'unit', 'item'])
    expect(rows).toEqual([
      ['1.5', 'l', 'milk'],
      ['2.25', 'kg', 'flour'],
      ['3', '', 'eggs'],
    ])
    // The guarantee that matters: every amount cell satisfies Number(), which is
    // the only test inferColumnType applies.
    expect(inferColumnType(rows.map((r) => r[0]))).toBe('number')
  })

  it('falls back to a single item column when most lines carry no pattern', () => {
    expect(inferListTable(['milk', 'bread', '2 eggs', 'butter'])).toEqual({
      columns: ['item'],
      rows: [['milk'], ['bread'], ['2 eggs'], ['butter']],
    })
  })
})

// ── previewListTable — the menu row's "4 rows · 3 columns" ───────────────────

describe('previewListTable', () => {
  it('counts the rows and columns the conversion will produce', () => {
    expect(previewListTable(ingredients)).toEqual({ rows: 4, columns: 3 })
  })

  it('is null for a block that is not a list (no table offered)', () => {
    expect(previewListTable({ id: 'b', type: 'text', content: 'prose' })).toBeNull()
    expect(previewListTable({ id: 'b', type: 'todo', items: [] })).toBeNull()
  })
})

// ── inferListDatabaseTitle — the database is named after its heading ─────────

describe('inferListDatabaseTitle', () => {
  it('uses a one-line heading text block immediately above the list', () => {
    const blocks = [{ id: 'h', type: 'text', content: '## ingredients' }, ingredients]
    expect(inferListDatabaseTitle(blocks as never, 1, 'sourdough, 78%')).toBe('ingredients')
  })

  it('falls back to the page title when the block above is not a short heading', () => {
    const blocks = [
      { id: 'p', type: 'text', content: 'Mix everything.\nThen wait a long time for it.' },
      ingredients,
    ]
    expect(inferListDatabaseTitle(blocks as never, 1, 'sourdough, 78%')).toBe('sourdough, 78%')
    expect(inferListDatabaseTitle([ingredients], 0, 'sourdough, 78%')).toBe('sourdough, 78%')
  })

  it('never returns an empty title', () => {
    expect(inferListDatabaseTitle([ingredients], 0, '')).toBe('Untitled')
  })
})

// ── tableRowsToPageInputs — the identifying column becomes the record title ──

describe('tableRowsToPageInputs with a title column', () => {
  it('titles each record from the chosen column, keeping every cell as a value', () => {
    const schema = [
      { id: 'p-amount', name: 'amount', type: 'number' as const },
      { id: 'p-unit', name: 'unit', type: 'text' as const },
      { id: 'p-item', name: 'item', type: 'text' as const },
    ]
    const [row] = tableRowsToPageInputs(schema, [{ id: 'r', cells: ['500', 'g', 'flour'] }], 2)
    expect(row).toEqual({
      title: 'flour',
      props: { 'p-amount': 500, 'p-unit': 'g', 'p-item': 'flour' },
    })
  })
})

// ── the databases root (3c) ──────────────────────────────────────────────────

describe('isDatabasesRoot', () => {
  it('is the top-level page titled "databases", case-insensitively', () => {
    expect(isDatabasesRoot({ parentId: null, title: DATABASES_ROOT_TITLE })).toBe(true)
    expect(isDatabasesRoot({ parentId: null, title: 'databases' })).toBe(true)
    expect(isDatabasesRoot({ parentId: 'x', title: 'Databases' })).toBe(false)
    expect(isDatabasesRoot({ parentId: null, title: 'Personal' })).toBe(false)
  })

  it('seeds the root lowercase, the way 3c draws it beside life', () => {
    expect(DATABASES_ROOT_TITLE).toBe('databases')
  })
})

describe('withoutDatabasesRoot', () => {
  const row = (id: string, title: string, parent_id: string | null = null) => ({
    id,
    title,
    parent_id,
  })

  it('drops the root AND its whole subtree — the two roots are peers, not areas', () => {
    const rows = [
      row('health', 'Health'),
      row('sleep', 'Sleep', 'health'),
      row('root-db', 'databases'),
      row('db-1', 'ingredients', 'root-db'),
      row('db-1-nested', 'archive', 'db-1'),
    ]
    expect(withoutDatabasesRoot(rows).map((r) => r.id)).toEqual(['health', 'sleep'])
  })

  it('leaves a pond with no databases root untouched', () => {
    const rows = [row('health', 'Health'), row('nested', 'databases', 'health')]
    expect(withoutDatabasesRoot(rows)).toEqual(rows)
  })
})

// ── createDatabaseFromList — orchestrator (AC2-5) ────────────────────────────

type Row = {
  id: string
  user_id: string
  workspace: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown
  props: Record<string, unknown>
  order: number
}

/**
 * In-memory fake Supabase covering the call shapes this path uses: the root
 * lookup (select→eq→eq→is → thenable list), createPage (insert→select→single),
 * deletePage (delete→eq, cascading to children the way the self-referential FK
 * does), and getPage/saveBlocks for the composition check. Assert end-state via
 * `_pages`. `failInsertAt` makes the Nth insert (1-based) fail, which is how the
 * partial-failure rollback is exercised.
 */
function makeFakeSupabase(seed: Row[], failInsertAt?: number) {
  const pages = new Map<string, Row>(seed.map((r) => [r.id, { ...r }]))
  let seq = 0
  let inserts = 0
  /** Delete these rows and, recursively, their children — the FK cascade. */
  const cascade = (victims: Row[]) => {
    for (const victim of victims) {
      pages.delete(victim.id)
      cascade([...pages.values()].filter((r) => r.parent_id === victim.id))
    }
  }
  const from = () => {
    let op: 'select' | 'insert' | 'update' | 'delete' | null = null
    let insertPayload: Record<string, unknown> | null = null
    const filters: Array<(r: Row) => boolean> = []
    const matching = () => [...pages.values()].filter((r) => filters.every((f) => f(r)))
    const builder = {
      select() {
        if (op === null) op = 'select'
        return builder
      },
      insert(payload: Record<string, unknown>) {
        op = 'insert'
        insertPayload = payload
        return builder
      },
      delete() {
        op = 'delete'
        return builder
      },
      eq(col: string, val: string) {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      is(col: string, val: null) {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      maybeSingle() {
        return Promise.resolve({ data: matching()[0] ?? null, error: null })
      },
      single() {
        // A non-23505 code, so createPage surfaces it rather than retrying with a
        // de-duplicated title.
        if (op === 'insert' && ++inserts === failInsertAt) {
          return Promise.resolve({
            data: null,
            error: { code: '08006', message: 'connection failure' },
          })
        }
        const id = `new-${++seq}`
        const row: Row = {
          id,
          user_id: (insertPayload?.user_id as string) ?? 'user-1',
          workspace: (insertPayload?.workspace as string) ?? 'main',
          parent_id: (insertPayload?.parent_id as string) ?? null,
          type: (insertPayload?.type as string) ?? 'page',
          title: (insertPayload?.title as string) ?? '',
          blocks: insertPayload?.blocks ?? [],
          props: (insertPayload?.props as Record<string, unknown>) ?? {},
          order: 0,
        }
        pages.set(id, row)
        return Promise.resolve({ data: { id }, error: null })
      },
      // The root lookup and the delete both await the filtered builder directly.
      then(resolve: (v: { data: Row[] | null; error: null }) => unknown) {
        if (op === 'delete') {
          cascade(matching())
          return Promise.resolve({ data: null, error: null }).then(resolve)
        }
        return Promise.resolve({ data: matching(), error: null }).then(resolve)
      },
    }
    return builder
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn(from),
    _pages: pages,
  }
}

const existingRoot: Row = {
  id: 'root-db',
  user_id: 'user-1',
  workspace: 'main',
  parent_id: null,
  type: 'page',
  title: 'databases',
  blocks: [],
  props: {},
  order: 9,
}

describe('getOrCreateDatabasesRoot', () => {
  it('creates the top-level databases page once, then reuses it', async () => {
    const sb = makeFakeSupabase([])
    const first = await getOrCreateDatabasesRoot(sb as never, 'user-1', 'main')
    const root = sb._pages.get(first.id)!
    expect(root.parent_id).toBeNull()
    expect(root.title).toBe(DATABASES_ROOT_TITLE)
    const second = await getOrCreateDatabasesRoot(sb as never, 'user-1', 'main')
    expect(second.id).toBe(first.id)
    expect(
      [...sb._pages.values()].filter((p) =>
        isDatabasesRoot({ parentId: p.parent_id, title: p.title })
      )
    ).toHaveLength(1)
  })

  it('finds an existing root whatever its title casing', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const root = await getOrCreateDatabasesRoot(sb as never, 'user-1', 'main')
    expect(root.id).toBe('root-db')
  })
})

describe('createDatabaseFromList', () => {
  it('creates a database from the rows under databases and returns a view of it (AC2-4)', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const result = await createDatabaseFromList(
      sb as never,
      { block: ingredients, title: 'ingredients' },
      counter()
    )

    // The new database is a collection page filed under the databases root (AC3).
    const database = sb._pages.get(result.databaseId)!
    expect(database.parent_id).toBe('root-db')
    expect(database.type).toBe('page')
    expect(database.title).toBe('ingredients')
    expect(result.databasesRootId).toBe('root-db')

    // Its fields are inferred within the 8 existing property types (AC4): the
    // amount column reads as number so it can be summed and charted.
    const schema = readSchema(database.props)!
    expect(schema.map((d) => [d.name, d.type])).toEqual([
      ['amount', 'number'],
      ['unit', 'text'],
      ['item', 'text'],
    ])
    for (const def of schema) expect(PROPERTY_TYPES).toContain(def.type)

    // Every line became a record (type='row' child) with typed values (AC2).
    const rows = [...sb._pages.values()].filter((p) => p.type === ROW_TYPE)
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.parent_id === result.databaseId)).toBe(true)
    const flour = rows.find((r) => r.title === 'strong white flour')!
    expect(flour.props[schema[0].id]).toBe(500)
    expect(flour.props[schema[1].id]).toBe('g')
    expect(flour.props[SCHEMA_KEY]).toBeUndefined()
    expect(result.rowCount).toBe(4)

    // The block becomes a table-mode view OF that database (a linked view).
    expect(result.view).toEqual({
      id: expect.any(String),
      type: 'view',
      mode: 'table',
      collectionId: result.databaseId,
    })
  })

  it('creates the databases root on first use when the pond has none', async () => {
    const sb = makeFakeSupabase([])
    const result = await createDatabaseFromList(
      sb as never,
      { block: ingredients, title: 'ingredients' },
      counter()
    )
    const root = sb._pages.get(result.databasesRootId)!
    expect(root.parent_id).toBeNull()
    expect(isDatabasesRoot({ parentId: root.parent_id, title: root.title })).toBe(true)
    expect(sb._pages.get(result.databaseId)!.parent_id).toBe(root.id)
  })

  it('composes with replaceBlockWithView to swap the list in place on the host page', async () => {
    const sb = makeFakeSupabase([existingRoot])
    const { view } = await createDatabaseFromList(
      sb as never,
      { block: ingredients, title: 'ingredients' },
      counter()
    )
    const blocks = [{ id: 'h', type: 'text', content: '## ingredients' }, ingredients] as never[]
    const next = replaceBlockWithView(blocks, ingredients.id, view)
    expect(next.map((b: { id: string; type: string }) => [b.type, b.id])).toEqual([
      ['text', 'h'],
      ['view', view.id],
    ])
  })

  it('refuses a block that is not a list', async () => {
    const sb = makeFakeSupabase([existingRoot])
    await expect(
      createDatabaseFromList(
        sb as never,
        { block: { id: 'b', type: 'text', content: 'prose' }, title: 'x' },
        counter()
      )
    ).rejects.toThrow(/not a list/i)
    expect(sb._pages.size).toBe(1)
  })

  it('leaves nothing stranded when a record write fails part-way through', async () => {
    // Insert 1 is the database page, 2–5 are the four records: fail the third
    // record, so two are already written when it goes wrong.
    const sb = makeFakeSupabase([existingRoot], 4)
    await expect(
      createDatabaseFromList(sb as never, { block: ingredients, title: 'ingredients' }, counter())
    ).rejects.toThrow(/connection failure/i)

    // The half-built database and every record under it are gone; the pre-existing
    // root survives, because this call did not create it.
    expect([...sb._pages.keys()]).toEqual(['root-db'])
  })

  it('removes the root it created too, when the very first write fails', async () => {
    // Insert 1 creates the root, insert 2 is the database page.
    const sb = makeFakeSupabase([], 2)
    await expect(
      createDatabaseFromList(sb as never, { block: ingredients, title: 'ingredients' }, counter())
    ).rejects.toThrow(/connection failure/i)
    expect([...sb._pages.values()]).toEqual([])
  })

  it('refuses when not authenticated', async () => {
    const sb = makeFakeSupabase([existingRoot])
    sb.auth.getUser.mockResolvedValue({ data: { user: null } })
    await expect(
      createDatabaseFromList(sb as never, { block: ingredients, title: 'x' }, counter())
    ).rejects.toThrow(/authenticated/i)
  })
})
