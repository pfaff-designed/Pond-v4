/**
 * Tests for the AI promote_table accept path (src/lib/pages/promote-table.ts).
 *
 * #29: an accepted promote_table proposal converts an existing freeform `table`
 * block on a page into a schema-bound collection — infers a property schema from
 * the columns (all-numeric→number, all-ISO-date→date, else text), turns each row
 * into a `type='row'` child page, and replaces the source table block with a
 * `view` block (table mode) in place. Pure helpers are exercised directly; the
 * orchestrator runs against an in-memory fake Supabase (no live DB).
 */

import {
  inferColumnType,
  inferSchema,
  tableRowsToPageInputs,
  replaceBlockWithView,
  promoteTableFromProposal,
} from '@/lib/pages/promote-table'
import { SCHEMA_KEY, ROW_TYPE, readSchema, type PropertySchema } from '@/lib/properties/schema'
import type { TableBlock } from '@/lib/modules/table/schema'

// A deterministic id minter for tests (crypto.randomUUID in prod).
function counter() {
  let n = 0
  return () => `id-${++n}`
}

// ── inferColumnType (AC4) ────────────────────────────────────────────────────

describe('inferColumnType', () => {
  it('infers number when every non-blank cell is numeric', () => {
    expect(inferColumnType(['1', '2.5', '-3', '1000'])).toBe('number')
  })

  it('infers date when every non-blank cell is an ISO date', () => {
    expect(inferColumnType(['2026-01-04', '2026-12-31'])).toBe('date')
  })

  it('falls back to text for a mixed column', () => {
    expect(inferColumnType(['5', 'later', '2026-01-04'])).toBe('text')
  })

  it('infers text for a plain-text column', () => {
    expect(inferColumnType(['Hammer', 'Chisel', 'Saw'])).toBe('text')
  })

  it('ignores blank cells and infers from the rest (numeric with gaps → number)', () => {
    expect(inferColumnType(['1', '', '  ', '3'])).toBe('number')
  })

  it('infers text for an all-blank (or empty) column', () => {
    expect(inferColumnType(['', '  '])).toBe('text')
    expect(inferColumnType([])).toBe('text')
  })

  it('prefers number over date for a bare-year column (numeric checked first)', () => {
    expect(inferColumnType(['2024', '2025'])).toBe('number')
  })
})

// ── inferSchema (AC1) ────────────────────────────────────────────────────────

describe('inferSchema', () => {
  it('builds a property per column with a minted id, the header name, and inferred type', () => {
    const columns = ['Item', 'Price', 'Due']
    const rows = [
      { id: 'r1', cells: ['Hammer', '12', '2026-01-04'] },
      { id: 'r2', cells: ['Saw', '30', '2026-02-01'] },
    ]
    expect(inferSchema(columns, rows, counter())).toEqual([
      { id: 'id-1', name: 'Item', type: 'text' },
      { id: 'id-2', name: 'Price', type: 'number' },
      { id: 'id-3', name: 'Due', type: 'date' },
    ])
  })
})

// ── tableRowsToPageInputs (AC2) ──────────────────────────────────────────────

describe('tableRowsToPageInputs', () => {
  const schema: PropertySchema = [
    { id: 'p-item', name: 'Item', type: 'text' },
    { id: 'p-price', name: 'Price', type: 'number' },
    { id: 'p-due', name: 'Due', type: 'date' },
  ]

  it('maps each row to a page: first column → title, cells → typed props by property id', () => {
    const rows = [
      { id: 'r1', cells: ['Hammer', '12', '2026-01-04'] },
      { id: 'r2', cells: ['Saw', '30', '2026-02-01'] },
    ]
    expect(tableRowsToPageInputs(schema, rows)).toEqual([
      { title: 'Hammer', props: { 'p-item': 'Hammer', 'p-price': 12, 'p-due': '2026-01-04' } },
      { title: 'Saw', props: { 'p-item': 'Saw', 'p-price': 30, 'p-due': '2026-02-01' } },
    ])
  })

  it('parses a numeric column string to a number (not left as text)', () => {
    const [row] = tableRowsToPageInputs(schema, [{ id: 'r', cells: ['Drill', '49.99', ''] }])
    expect(row.props['p-price']).toBe(49.99)
  })

  it('collapses a blank / unparseable numeric cell to null', () => {
    const [row] = tableRowsToPageInputs(schema, [{ id: 'r', cells: ['Nails', 'lots', ''] }])
    expect(row.props['p-price']).toBeNull()
    expect(row.props['p-due']).toBeNull()
  })

  it('tolerates a short row (missing trailing cells become empty)', () => {
    const [row] = tableRowsToPageInputs(schema, [{ id: 'r', cells: ['Glue'] }])
    expect(row).toEqual({
      title: 'Glue',
      props: { 'p-item': 'Glue', 'p-price': null, 'p-due': null },
    })
  })
})

// ── replaceBlockWithView (AC3) ───────────────────────────────────────────────

describe('replaceBlockWithView', () => {
  it('swaps the table block for the view block in place, preserving order and siblings', () => {
    const blocks = [
      { id: 'b-text', type: 'text', content: 'Intro' },
      { id: 'b-table', type: 'table', columns: ['A'], rows: [] },
      { id: 'b-foot', type: 'text', content: 'Outro' },
    ] as never[]
    const view = { id: 'b-view', type: 'view', mode: 'table' } as never
    const out = replaceBlockWithView(blocks, 'b-table', view)
    expect(out.map((b: { id: string }) => b.id)).toEqual(['b-text', 'b-view', 'b-foot'])
    expect(out[1]).toBe(view)
  })

  it('leaves the block array untouched when the target id is absent', () => {
    const blocks = [{ id: 'b-text', type: 'text', content: 'x' }] as never[]
    const view = { id: 'b-view', type: 'view', mode: 'table' } as never
    expect(replaceBlockWithView(blocks, 'nope', view)).toEqual(blocks)
  })
})

// ── promoteTableFromProposal — orchestrator (AC1-3) ───────────────────────────

type Row = {
  id: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown
  props: Record<string, unknown>
  order: number
}

/**
 * In-memory fake Supabase covering exactly the call shapes the accept path uses:
 * getPage (select→eq→maybeSingle), createPage (insert→select→single),
 * saveProps/saveBlocks (update→eq). A fresh builder per `from()` keeps op state
 * isolated. Assert end-state via `_pages`.
 */
function makeFakeSupabase(seed: Row[]) {
  const pages = new Map<string, Row>(seed.map((r) => [r.id, { ...r }]))
  let seq = 0
  const from = () => {
    let op: 'select' | 'insert' | 'update' | null = null
    let insertPayload: Record<string, unknown> | null = null
    let patch: Record<string, unknown> | null = null
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
      update(p: Record<string, unknown>) {
        op = 'update'
        patch = p
        return builder
      },
      eq(_col: string, val: string) {
        if (op === 'update') {
          const existing = pages.get(val)
          if (existing) pages.set(val, { ...existing, ...(patch as object) })
          return Promise.resolve({ error: null })
        }
        // select filter
        ;(builder as { _id?: string })._id = val
        return builder
      },
      maybeSingle() {
        const id = (builder as { _id?: string })._id
        return Promise.resolve({ data: id ? (pages.get(id) ?? null) : null, error: null })
      },
      single() {
        const id = `new-${++seq}`
        const row: Row = {
          id,
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
    }
    return builder
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn(from),
    _pages: pages,
  }
}

const tableBlock: TableBlock = {
  id: 'b-table',
  type: 'table',
  title: 'Shopping',
  columns: ['Item', 'Price', 'Due'],
  rows: [
    { id: 'r1', cells: ['Hammer', '12', '2026-01-04'] },
    { id: 'r2', cells: ['Saw', '30', '2026-02-01'] },
  ],
}

function seededPage(blocks: unknown[]): Row {
  return {
    id: 'page-1',
    parent_id: null,
    type: 'page',
    title: 'Workshop',
    blocks,
    props: {},
    order: 0,
  }
}

describe('promoteTableFromProposal', () => {
  it('turns the host page into a collection, rows into pages, and swaps table→view (AC1-3)', async () => {
    const sb = makeFakeSupabase([
      seededPage([{ id: 'b-intro', type: 'text', content: 'hi' }, tableBlock]),
    ])
    const result = await promoteTableFromProposal(
      sb as never,
      { pageId: 'page-1', blockId: 'b-table' },
      counter()
    )

    // The host page is now a collection with the inferred schema (AC1).
    const page = sb._pages.get('page-1')!
    const schema = readSchema(page.props)!
    expect(schema.map((d) => [d.name, d.type])).toEqual([
      ['Item', 'text'],
      ['Price', 'number'],
      ['Due', 'date'],
    ])

    // Each data row became a type='row' child carrying typed values (AC2).
    const rows = [...sb._pages.values()].filter((p) => p.type === ROW_TYPE)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.parent_id === 'page-1')).toBe(true)
    expect(rows.map((r) => r.title).sort()).toEqual(['Hammer', 'Saw'])
    const hammer = rows.find((r) => r.title === 'Hammer')!
    expect(hammer.props[schema[1].id]).toBe(12)
    expect(hammer.props[schema[2].id]).toBe('2026-01-04')
    // A row never carries a schema of its own.
    expect(hammer.props[SCHEMA_KEY]).toBeUndefined()

    // The table block was replaced by a view (table mode) in place (AC3).
    const blocks = page.blocks as Array<{ id: string; type: string; mode?: string }>
    expect(blocks.map((b) => b.type)).toEqual(['text', 'view'])
    const view = blocks.find((b) => b.type === 'view')!
    expect(view.mode).toBe('table')
    expect(result.collectionId).toBe('page-1')
    expect(result.viewBlockId).toBe(view.id)
    expect(result.rowCount).toBe(2)
  })

  it('finds the sole table block when blockId is omitted', async () => {
    const sb = makeFakeSupabase([
      seededPage([{ id: 'x', type: 'text', content: 'hi' }, tableBlock]),
    ])
    const result = await promoteTableFromProposal(sb as never, { pageId: 'page-1' }, counter())
    expect(result.rowCount).toBe(2)
    expect(readSchema(sb._pages.get('page-1')!.props)).not.toBeNull()
  })

  it('throws when the page does not exist', async () => {
    const sb = makeFakeSupabase([])
    await expect(
      promoteTableFromProposal(sb as never, { pageId: 'ghost' }, counter())
    ).rejects.toThrow(/not found/i)
  })

  it('throws when the named block is not a table', async () => {
    const sb = makeFakeSupabase([seededPage([{ id: 'b-text', type: 'text', content: 'x' }])])
    await expect(
      promoteTableFromProposal(sb as never, { pageId: 'page-1', blockId: 'b-text' }, counter())
    ).rejects.toThrow(/table/i)
  })

  it('throws when the page has no table block to promote', async () => {
    const sb = makeFakeSupabase([seededPage([{ id: 'b-text', type: 'text', content: 'x' }])])
    await expect(
      promoteTableFromProposal(sb as never, { pageId: 'page-1' }, counter())
    ).rejects.toThrow(/table/i)
  })
})
