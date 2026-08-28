/**
 * Same-batch bindings (ticket-31) — closes ticket-23's deferred boundary.
 *
 * A metric can bind, in ONE changes[] batch, to a checklist/table also being created:
 * the create op carries a batch-local `key`, the metric references it via
 * `source.ref`, and the client resolves ref→minted-id at accept time. What persists
 * is always the ordinary `{ blockId, kind }` form; an unknown ref drops the binding
 * cleanly (metric falls back to manual — never dangles).
 *
 * Covers the resolver in isolation AND end-to-end through applyProposedChanges (the
 * real accept path), including partial accept (source op rejected).
 */
import { resolveSourceRef } from '@/lib/modules/same-batch-refs'
import { applyProposedChanges } from '@/lib/pages/edits'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'

function counter() {
  let n = 0
  return () => `mint-${++n}`
}

describe('resolveSourceRef (the ref→id rewrite)', () => {
  const refs = new Map([['chores', 'blk-123']])

  it('rewrites a metric source.ref to the resolved blockId', () => {
    const out = resolveSourceRef(
      {
        type: 'metric',
        label: 'Done',
        value: 0,
        source: { ref: 'chores', kind: 'checklist-checked' },
      },
      refs
    ) as Record<string, unknown>
    expect(out.source).toEqual({ blockId: 'blk-123', kind: 'checklist-checked' })
  })

  it('drops the whole source for an UNKNOWN ref (falls back to manual, never dangles)', () => {
    const out = resolveSourceRef(
      {
        type: 'metric',
        label: 'Done',
        value: 7,
        source: { ref: 'ghost', kind: 'checklist-checked' },
      },
      refs
    ) as Record<string, unknown>
    expect('source' in out).toBe(false)
    expect(out.value).toBe(7)
  })

  it('leaves an existing blockId binding untouched', () => {
    const data = {
      type: 'metric',
      label: 'x',
      value: 0,
      source: { blockId: 'real', kind: 'table-rows' },
    }
    expect(resolveSourceRef(data, refs)).toEqual(data)
  })

  it('leaves an unbound metric and non-metric blocks untouched', () => {
    const metric = { type: 'metric', label: 'x', value: 3 }
    expect(resolveSourceRef(metric, refs)).toEqual(metric)
    const text = { type: 'text', content: 'hi' }
    expect(resolveSourceRef(text, refs)).toEqual(text)
  })
})

describe('applyProposedChanges — same-batch binding end to end', () => {
  it('binds a metric to a checklist created in the SAME batch (the core proof)', () => {
    const changes: ModuleChange[] = [
      {
        op: 'create',
        key: 'chores',
        data: {
          type: 'todo',
          items: [
            { label: 'Sand', checked: true },
            { label: 'Stain', checked: false },
          ],
        },
      } as ModuleChange,
      {
        op: 'create',
        data: {
          type: 'metric',
          label: 'Done',
          value: 0,
          source: { ref: 'chores', kind: 'checklist-checked' },
        },
      } as ModuleChange,
    ]
    const { blocks, applied, skipped } = applyProposedChanges([], changes, counter())
    expect(applied).toBe(2)
    expect(skipped).toBe(0)

    const todo = blocks.find((b) => b.type === 'todo')!
    const metric = blocks.find((b) => b.type === 'metric')! as Extract<Block, { type: 'metric' }>
    // The binding persists as an ordinary blockId → the minted todo id (serialize
    // honesty: post-accept it's a normal blockId binding, no ref survives).
    expect(metric.source).toEqual({ blockId: todo.id, kind: 'checklist-checked' })
  })

  it('resolves a ref to a create that appears LATER in the array (two-pass minting)', () => {
    const changes: ModuleChange[] = [
      {
        op: 'create',
        data: {
          type: 'metric',
          label: 'Rows',
          value: 0,
          source: { ref: 'inv', kind: 'table-rows' },
        },
      } as ModuleChange,
      {
        op: 'create',
        key: 'inv',
        data: { type: 'table', columns: ['Item'], rows: [{ cells: ['a'] }, { cells: ['b'] }] },
      } as ModuleChange,
    ]
    const { blocks } = applyProposedChanges([], changes, counter())
    const table = blocks.find((b) => b.type === 'table')!
    const metric = blocks.find((b) => b.type === 'metric')! as Extract<Block, { type: 'metric' }>
    expect(metric.source).toEqual({ blockId: table.id, kind: 'table-rows' })
  })

  it('partial accept: the source create is REJECTED (absent) → binding drops, metric still lands manual', () => {
    // Only the metric is accepted; its keyed checklist create was rejected, so no
    // create carries key 'chores'. The ref is unknown → the metric persists unbound
    // with its manual value, never a dangling { ref } or a phantom blockId.
    const changes: ModuleChange[] = [
      {
        op: 'create',
        data: {
          type: 'metric',
          label: 'Done',
          value: 4,
          source: { ref: 'chores', kind: 'checklist-checked' },
        },
      } as ModuleChange,
    ]
    const { blocks, applied, skipped } = applyProposedChanges([], changes, counter())
    expect(applied).toBe(1)
    expect(skipped).toBe(0)
    const metric = blocks[0] as Extract<Block, { type: 'metric' }>
    expect(metric.source).toBeUndefined()
    expect(metric.value).toBe(4)
  })

  it('a metric with a resolvable ref but otherwise malformed data is still skipped (accept gate holds)', () => {
    const changes = [
      { op: 'create', key: 'src', data: { type: 'todo', items: [] } },
      {
        op: 'create',
        // value is a string → fails re-validation in hydrateBlock even after ref
        // resolution; skipped, never written.
        data: {
          type: 'metric',
          label: 'bad',
          value: 'lots',
          source: { ref: 'src', kind: 'checklist-total' },
        },
      },
    ] as unknown as ModuleChange[]
    const { blocks, applied, skipped } = applyProposedChanges([], changes, counter())
    expect(applied).toBe(1) // the todo
    expect(skipped).toBe(1) // the malformed metric
    expect(blocks.some((b) => b.type === 'metric')).toBe(false)
  })
})
