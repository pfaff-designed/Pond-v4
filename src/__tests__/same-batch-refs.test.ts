/**
 * Same-batch bindings (ticket-31) — closes ticket-23's deferred boundary.
 *
 * A metric can bind, in ONE batch, to a checklist/table also being created: the
 * create (a propose_changes op or a create_page block entry) carries a batch-local
 * `bindKey`, the metric references it via `source.ref`, and the client resolves
 * ref→minted-id at accept time. What persists is always the `{ blockId, kind }`
 * form — structurally: the persisted metric schema rejects a `ref`, so a missed
 * resolve fails validation instead of writing one. An unknown ref drops the binding
 * cleanly (metric falls back to manual — never dangles).
 *
 * Covers the resolver pieces in isolation AND end-to-end through the two accept
 * paths (applyProposedChanges, hydrateProposalBlocks), including the review-fix
 * cases: per-change accepts split across calls in either order, an explicitly
 * REJECTED source create, and a keyed create that fails validation (must never
 * become a binding target).
 */
import { collectBatchRefIds, resolveSourceRef } from '@/lib/modules/same-batch-refs'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { applyProposedChanges } from '@/lib/pages/edits'
import { hydrateProposalBlocks } from '@/lib/pages/create-page'
import type { ModuleChange, CreatePageBlock } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'

function counter() {
  let n = 0
  return () => `mint-${++n}`
}

const checklistData = {
  type: 'todo',
  items: [
    { label: 'Sand', checked: true },
    { label: 'Stain', checked: false },
  ],
}

const keyedChecklist = {
  op: 'create',
  bindKey: 'chores',
  data: checklistData,
} as ModuleChange

const boundMetric = {
  op: 'create',
  data: {
    type: 'metric',
    label: 'Done',
    value: 0,
    source: { ref: 'chores', kind: 'checklist-checked' },
  },
} as ModuleChange

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
    ) as { source?: unknown }
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

describe('persisted schema rejects an unresolved ref (emit/persisted split)', () => {
  it('hydrateBlock fails a metric whose source still names a ref', () => {
    // The structural invariant behind "a ref never reaches storage": if a resolve
    // pass is ever forgotten, validation fails and the change is skipped — a ref
    // cannot be silently persisted.
    const block = hydrateBlock(
      {
        type: 'metric',
        label: 'x',
        value: 0,
        source: { ref: 'chores', kind: 'checklist-checked' },
      },
      'id-1',
      () => 'id-n'
    )
    expect(block).toBeNull()
  })
})

describe('collectBatchRefIds (batch-wide key→id map)', () => {
  it('maps valid keyed creates and remembers minted ids in refIds', () => {
    const refIds: Record<string, string> = {}
    const map = collectBatchRefIds([{ bindKey: 'chores', data: checklistData }], counter(), {
      refIds,
    })
    expect(map.get('chores')).toBe('mint-1')
    expect(refIds.chores).toBe('mint-1')
  })

  it('reuses an id already remembered for a key (cross-call stability)', () => {
    const refIds: Record<string, string> = { chores: 'landed-earlier' }
    const map = collectBatchRefIds([{ bindKey: 'chores', data: checklistData }], counter(), {
      refIds,
    })
    expect(map.get('chores')).toBe('landed-earlier')
  })

  it('does NOT map a key whose data fails validation (phantom-blockId fix)', () => {
    const map = collectBatchRefIds(
      [{ bindKey: 'bad', data: { type: 'todo', items: 'not-an-array' } }],
      counter()
    )
    expect(map.has('bad')).toBe(false)
  })

  it('does NOT map a rejected key', () => {
    const map = collectBatchRefIds([{ bindKey: 'chores', data: checklistData }], counter(), {
      rejectedKeys: new Set(['chores']),
    })
    expect(map.has('chores')).toBe(false)
  })
})

describe('applyProposedChanges — same-batch binding end to end', () => {
  it('binds a metric to a checklist created in the SAME batch (the core proof)', () => {
    const changes: ModuleChange[] = [keyedChecklist, boundMetric]
    const { blocks, applied, skipped } = applyProposedChanges([], changes, counter())
    expect(applied).toBe(2)
    expect(skipped).toBe(0)

    const todo = blocks.find((b) => b.type === 'todo')!
    const metric = blocks.find((b) => b.type === 'metric')! as Extract<Block, { type: 'metric' }>
    // The binding persists as an ordinary blockId → the minted todo id (serialize
    // honesty: post-accept it's a normal blockId binding, no ref survives).
    expect(metric.source).toEqual({ blockId: todo.id, kind: 'checklist-checked' })
  })

  it('resolves a ref to a create that appears LATER in the array', () => {
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
        bindKey: 'inv',
        data: { type: 'table', columns: ['Item'], rows: [{ cells: ['a'] }, { cells: ['b'] }] },
      } as ModuleChange,
    ]
    const { blocks } = applyProposedChanges([], changes, counter())
    const table = blocks.find((b) => b.type === 'table')!
    const metric = blocks.find((b) => b.type === 'metric')! as Extract<Block, { type: 'metric' }>
    expect(metric.source).toEqual({ blockId: table.id, kind: 'table-rows' })
  })

  it('per-change accepts split across calls still bind — source first', () => {
    // Click 1 accepts the checklist, click 2 the metric. The refIds record carries
    // the minted id between calls; the metric binds to the ALREADY-LANDED id.
    const batch: ModuleChange[] = [keyedChecklist, boundMetric]
    const refIds: Record<string, string> = {}
    const mint = counter()

    const first = applyProposedChanges([], [keyedChecklist], mint, { batch, refIds })
    const todo = first.blocks.find((b) => b.type === 'todo')!

    const second = applyProposedChanges(first.blocks, [boundMetric], mint, { batch, refIds })
    const metric = second.blocks.find((b) => b.type === 'metric')! as Extract<
      Block,
      { type: 'metric' }
    >
    expect(metric.source).toEqual({ blockId: todo.id, kind: 'checklist-checked' })
  })

  it('per-change accepts split across calls still bind — metric first (out of order)', () => {
    // Click 1 accepts only the metric: it binds to the id RESERVED for the pending
    // checklist (stale until it lands). Click 2 accepts the checklist, which lands
    // with that same reserved id — the binding heals into a live derivation.
    const batch: ModuleChange[] = [keyedChecklist, boundMetric]
    const refIds: Record<string, string> = {}
    const mint = counter()

    const first = applyProposedChanges([], [boundMetric], mint, { batch, refIds })
    const metric = first.blocks.find((b) => b.type === 'metric')! as Extract<
      Block,
      { type: 'metric' }
    >
    expect(metric.source).toBeDefined()

    const second = applyProposedChanges(first.blocks, [keyedChecklist], mint, { batch, refIds })
    const todo = second.blocks.find((b) => b.type === 'todo')!
    // The checklist landed with exactly the id the metric was bound to. A resolved
    // ref becomes a same-page `{ blockId }` source (ticket-38 widened the union).
    expect(metric.source).toMatchObject({ blockId: todo.id })
  })

  it('partial accept: the source create was REJECTED → binding drops, metric lands manual', () => {
    // The keyed checklist is in the batch but the user rejected it. rejectedKeys
    // excludes it from the map, so the metric persists unbound with its manual
    // value — never a dangling binding to an id that will never land.
    const batch: ModuleChange[] = [keyedChecklist, boundMetric]
    const { blocks, applied, skipped } = applyProposedChanges([], [boundMetric], counter(), {
      batch,
      rejectedKeys: new Set(['chores']),
    })
    expect(applied).toBe(1)
    expect(skipped).toBe(0)
    const metric = blocks[0] as Extract<Block, { type: 'metric' }>
    expect(metric.source).toBeUndefined()
  })

  it('partial accept with NO batch context (source op simply absent) also lands manual', () => {
    const { blocks, applied } = applyProposedChanges([], [boundMetric], counter())
    expect(applied).toBe(1)
    const metric = blocks[0] as Extract<Block, { type: 'metric' }>
    expect(metric.source).toBeUndefined()
    expect(metric.value).toBe(0)
  })

  it('a keyed create that fails validation is never a binding target (phantom fix)', () => {
    // The malformed checklist will be SKIPPED at accept — so the metric must not be
    // rewritten to its would-be id. The binding drops; the metric lands manual.
    const changes = [
      { op: 'create', bindKey: 'bad', data: { type: 'todo', items: 'not-an-array' } },
      {
        op: 'create',
        data: {
          type: 'metric',
          label: 'Done',
          value: 4,
          source: { ref: 'bad', kind: 'checklist-checked' },
        },
      },
    ] as unknown as ModuleChange[]
    const { blocks, applied, skipped } = applyProposedChanges([], changes, counter())
    expect(applied).toBe(1) // the metric
    expect(skipped).toBe(1) // the malformed todo
    const metric = blocks[0] as Extract<Block, { type: 'metric' }>
    expect(metric.source).toBeUndefined()
    expect(metric.value).toBe(4)
  })

  it('a metric with a resolvable ref but otherwise malformed data is still skipped', () => {
    const changes = [
      { op: 'create', bindKey: 'src', data: { type: 'todo', items: [] } },
      {
        // value is a string → fails re-validation even after ref resolution.
        op: 'create',
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

describe('hydrateProposalBlocks — same-batch binding inside create_page', () => {
  it('a scaffolded page is born with a LIVE metric (the original audit case)', () => {
    const blocks = [
      {
        type: 'todo',
        bindKey: 'milestones',
        items: [
          { label: 'Frame', checked: false },
          { label: 'Wire', checked: false },
        ],
      },
      {
        type: 'metric',
        label: 'Milestones complete',
        value: 0,
        source: { ref: 'milestones', kind: 'checklist-checked' },
      },
    ] as unknown as CreatePageBlock[]
    const out = hydrateProposalBlocks(blocks, counter())
    expect(out).toHaveLength(2)
    const todo = out.find((b) => b.type === 'todo')!
    const metric = out.find((b) => b.type === 'metric')! as Extract<Block, { type: 'metric' }>
    expect(metric.source).toEqual({ blockId: todo.id, kind: 'checklist-checked' })
    // bindKey is authoring-only — it must not persist on the hydrated block.
    expect('bindKey' in todo).toBe(false)
  })

  it('an unknown ref in create_page drops the binding cleanly', () => {
    const blocks = [
      {
        type: 'metric',
        label: 'Done',
        value: 2,
        source: { ref: 'never-emitted', kind: 'checklist-checked' },
      },
    ] as unknown as CreatePageBlock[]
    const out = hydrateProposalBlocks(blocks, counter())
    expect(out).toHaveLength(1)
    const metric = out[0] as Extract<Block, { type: 'metric' }>
    expect(metric.source).toBeUndefined()
    expect(metric.value).toBe(2)
  })
})
