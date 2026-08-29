/**
 * Metric derivation (ticket-23) — the pure count logic that turns a metric's
 * optional `source` binding + the page's sibling blocks into a displayed value.
 *
 * Covers: checked-count, total-count, table-rows, the unbound passthrough, and the
 * stale-source fallbacks (deleted block, and a block of the wrong type for the kind).
 */
import { deriveMetricValue, type CrossPageBlocks } from '@/lib/modules/metric/derive'
import type { MetricBlock } from '@/lib/modules/metric/schema'
import type { Block } from '@/lib/modules/content'

const todo: Block = {
  id: 'todo-1',
  type: 'todo',
  items: [
    { id: 'i1', label: 'Dune', checked: true },
    { id: 'i2', label: 'Hyperion', checked: true },
    { id: 'i3', label: 'Neuromancer', checked: false },
  ],
}

const table: Block = {
  id: 'tbl-1',
  type: 'table',
  columns: ['Title', 'Status'],
  rows: [
    { id: 'r1', cells: ['Dune', 'Read'] },
    { id: 'r2', cells: ['Hyperion', 'To Read'] },
  ],
}

function metric(source?: MetricBlock['source']): MetricBlock {
  return { id: 'm1', type: 'metric', label: 'Books finished', value: 99, source }
}

describe('deriveMetricValue (ticket-23)', () => {
  it('unbound: returns the manual value untouched', () => {
    const d = deriveMetricValue(metric(), [todo, table])
    expect(d).toEqual({ state: 'unbound', value: 99 })
  })

  it('checklist-checked: counts ticked items live', () => {
    const d = deriveMetricValue(metric({ blockId: 'todo-1', kind: 'checklist-checked' }), [todo])
    expect(d).toEqual({ state: 'derived', value: 2, sourceId: 'todo-1' })
  })

  it('checklist-total: counts all items', () => {
    const d = deriveMetricValue(metric({ blockId: 'todo-1', kind: 'checklist-total' }), [todo])
    expect(d).toEqual({ state: 'derived', value: 3, sourceId: 'todo-1' })
  })

  it('table-rows: counts rows', () => {
    const d = deriveMetricValue(metric({ blockId: 'tbl-1', kind: 'table-rows' }), [todo, table])
    expect(d).toEqual({ state: 'derived', value: 2, sourceId: 'tbl-1' })
  })

  it('recomputes live when the source block state changes', () => {
    const before = deriveMetricValue(metric({ blockId: 'todo-1', kind: 'checklist-checked' }), [
      todo,
    ])
    const toggled: Block = {
      ...todo,
      items: todo.type === 'todo' ? todo.items.map((i) => ({ ...i, checked: true })) : [],
    }
    const after = deriveMetricValue(metric({ blockId: 'todo-1', kind: 'checklist-checked' }), [
      toggled,
    ])
    // Both are same-page derived states (they carry a value); assert the count.
    expect(before).toMatchObject({ state: 'derived', value: 2 })
    expect(after).toMatchObject({ state: 'derived', value: 3 })
  })

  it('stale (deleted source): falls back to the manual value, flagged stale', () => {
    const d = deriveMetricValue(metric({ blockId: 'gone', kind: 'checklist-checked' }), [table])
    expect(d).toEqual({ state: 'stale', value: 99, sourceId: 'gone' })
  })

  it('stale (type mismatch): a table bound as a checklist falls back, never crashes', () => {
    const d = deriveMetricValue(metric({ blockId: 'tbl-1', kind: 'checklist-checked' }), [table])
    expect(d).toEqual({ state: 'stale', value: 99, sourceId: 'tbl-1' })
  })

  it('stale (type mismatch): a todo bound as table-rows falls back', () => {
    const d = deriveMetricValue(metric({ blockId: 'todo-1', kind: 'table-rows' }), [todo])
    expect(d).toEqual({ state: 'stale', value: 99, sourceId: 'todo-1' })
  })
})

// ── ticket-38: cross-page & aggregate derivation ───────────────────────────────

const loaded = (
  entries: [string, readonly Block[]][],
  childPageIds: string[] = []
): CrossPageBlocks => ({
  loaded: true,
  blocksByPage: new Map(entries),
  childPageIds,
})

describe('deriveMetricValue — cross-page binding (ticket-38)', () => {
  const crossMetric = (): MetricBlock => ({
    id: 'm1',
    type: 'metric',
    label: 'Milestone tasks done',
    value: 7, // manual fallback, must never surface while live
    source: { pageId: 'page-A', blockId: 'todo-1', kind: 'checklist-checked' },
  })

  it('derives from a block on ANOTHER page once loaded', () => {
    const d = deriveMetricValue(crossMetric(), [], loaded([['page-A', [todo]]]))
    // 2 checked on the other page's todo — not the manual 7, not this page's siblings.
    expect(d).toEqual({ state: 'derived', value: 2, sourceId: 'todo-1' })
  })

  it('pending while the bound page is still loading — never the manual value', () => {
    const stillLoading: CrossPageBlocks = {
      loaded: false,
      blocksByPage: new Map(),
      childPageIds: [],
    }
    expect(deriveMetricValue(crossMetric(), [], stillLoading)).toEqual({ state: 'pending' })
  })

  it('pending when no cross-page resolution is supplied at all (host without the seam)', () => {
    expect(deriveMetricValue(crossMetric(), [])).toEqual({ state: 'pending' })
  })

  it('stale when the bound page is gone (loaded, but absent from the map)', () => {
    const d = deriveMetricValue(crossMetric(), [], loaded([['other', [todo]]]))
    expect(d).toEqual({ state: 'stale', value: 7, sourceId: 'todo-1' })
  })

  it('stale when the page loaded but the source block was deleted', () => {
    const d = deriveMetricValue(crossMetric(), [], loaded([['page-A', [table]]]))
    expect(d).toEqual({ state: 'stale', value: 7, sourceId: 'todo-1' })
  })

  it("does NOT read this page's siblings for a cross-page binding", () => {
    // A same-id block on THIS page must not satisfy a cross-page source — the page id
    // is part of the identity. page-A absent → stale, even though a local todo-1 exists.
    const d = deriveMetricValue(crossMetric(), [todo], loaded([]))
    expect(d.state).toBe('stale')
  })
})

describe('deriveMetricValue — child-pages aggregate (ticket-38)', () => {
  const aggMetric = (
    kind: 'checklist-checked' | 'checklist-total' | 'table-rows' = 'checklist-checked'
  ): MetricBlock => ({
    id: 'm1',
    type: 'metric',
    label: 'Tasks done across milestones',
    value: 99,
    source: { pages: 'children', kind },
  })

  const todoA: Block = {
    id: 't-a',
    type: 'todo',
    items: [
      { id: 'a1', label: 'x', checked: true },
      { id: 'a2', label: 'y', checked: false },
    ],
  }
  const todoB: Block = {
    id: 't-b',
    type: 'todo',
    items: [
      { id: 'b1', label: 'x', checked: true },
      { id: 'b2', label: 'y', checked: true },
      { id: 'b3', label: 'z', checked: false },
    ],
  }

  it('SUMS checked items across every child page', () => {
    const cross = loaded(
      [
        ['child-1', [todoA]],
        ['child-2', [todoB]],
      ],
      ['child-1', 'child-2']
    )
    // 1 checked in A + 2 checked in B = 3, across 2 contributing pages.
    expect(deriveMetricValue(aggMetric(), [], cross)).toEqual({
      state: 'aggregate',
      value: 3,
      pageCount: 2,
    })
  })

  it('sums totals and multiple matching blocks on one page', () => {
    const twoTodos: Block[] = [todoA, todoB] // 2 + 3 = 5 items total on one child
    const cross = loaded([['child-1', twoTodos]], ['child-1'])
    expect(deriveMetricValue(aggMetric('checklist-total'), [], cross)).toEqual({
      state: 'aggregate',
      value: 5,
      pageCount: 1,
    })
  })

  it('pageCount counts only CONTRIBUTING children (empty/non-matching child excluded)', () => {
    const cross = loaded(
      [
        ['child-1', [todoA]], // 1 checked → contributes
        ['child-2', [table]], // a table, no checklist → does NOT contribute to a checklist-checked rollup
        ['child-3', []], // empty page → does not contribute
      ],
      ['child-1', 'child-2', 'child-3']
    )
    expect(deriveMetricValue(aggMetric(), [], cross)).toEqual({
      state: 'aggregate',
      value: 1,
      pageCount: 1,
    })
  })

  it('table-rows aggregate sums rows across child tables', () => {
    const cross = loaded(
      [
        ['child-1', [table]], // 2 rows
        ['child-2', [table]], // 2 rows
      ],
      ['child-1', 'child-2']
    )
    expect(deriveMetricValue(aggMetric('table-rows'), [], cross)).toEqual({
      state: 'aggregate',
      value: 4,
      pageCount: 2,
    })
  })

  it('empty rollup: no children → aggregate 0 across 0 pages (a real, honest zero)', () => {
    expect(deriveMetricValue(aggMetric(), [], loaded([], []))).toEqual({
      state: 'aggregate',
      value: 0,
      pageCount: 0,
    })
  })

  it('pending while the children tree / child pages are still loading', () => {
    const stillLoading: CrossPageBlocks = {
      loaded: false,
      blocksByPage: new Map(),
      childPageIds: [],
    }
    expect(deriveMetricValue(aggMetric(), [], stillLoading)).toEqual({ state: 'pending' })
    expect(deriveMetricValue(aggMetric(), [])).toEqual({ state: 'pending' })
  })

  it('ERRORED fetch: falls back to the manual value, NEVER a confident partial sum', () => {
    // One child loaded fine (1 checked), another errored (review fix): summing only the
    // loaded child would show a confident under-count of 1. The errored flag forces the
    // stale fallback (manual 99 + "source missing" note) until a refetch succeeds.
    const partiallyLoaded: CrossPageBlocks = {
      loaded: true,
      blocksByPage: new Map([['child-1', [todoA]]]),
      childPageIds: ['child-1', 'child-2'],
      errored: true,
    }
    expect(deriveMetricValue(aggMetric(), [], partiallyLoaded)).toEqual({
      state: 'stale',
      value: 99,
    })
  })
})
