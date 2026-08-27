/**
 * Metric derivation (ticket-23) — the pure count logic that turns a metric's
 * optional `source` binding + the page's sibling blocks into a displayed value.
 *
 * Covers: checked-count, total-count, table-rows, the unbound passthrough, and the
 * stale-source fallbacks (deleted block, and a block of the wrong type for the kind).
 */
import { deriveMetricValue } from '@/lib/modules/metric/derive'
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
    expect(before.value).toBe(2)
    expect(after.value).toBe(3)
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
