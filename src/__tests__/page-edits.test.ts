/**
 * Unit tests for applyProposedEdit — the pure block-replacement used by the
 * diff-card Accept path (ticket-10). Accepting an AI proposal replaces the
 * content of the target block (by its stable id) and writes the whole array.
 */

import { applyProposedEdit, applyProposedChanges } from '@/lib/pages/edits'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'

const base: Block[] = [
  { id: 'a', type: 'text', content: 'first' },
  { id: 'b', type: 'text', content: 'second' },
  { id: 'c', type: 'todo', items: [{ id: 't1', label: 'x', checked: false }] },
]

describe('applyProposedEdit', () => {
  it('replaces only the targeted text block content', () => {
    const out = applyProposedEdit(base, 'b', 'second — rewritten')
    expect(out.find((x) => x.id === 'b')).toEqual({
      id: 'b',
      type: 'text',
      content: 'second — rewritten',
    })
    // others untouched
    expect(out.find((x) => x.id === 'a')).toEqual(base[0])
    expect(out.find((x) => x.id === 'c')).toEqual(base[2])
  })

  it('returns a new array and does not mutate the input', () => {
    const out = applyProposedEdit(base, 'a', 'changed')
    expect(out).not.toBe(base)
    expect(base[0].type === 'text' && base[0].content).toBe('first') // input intact
  })

  it('is a no-op when the block id is not found', () => {
    const out = applyProposedEdit(base, 'missing', 'nope')
    expect(out).toEqual(base)
  })

  it('is a no-op when the target block is not a text block (text-only slice)', () => {
    const out = applyProposedEdit(base, 'c', 'cannot edit a todo as text')
    expect(out.find((x) => x.id === 'c')).toEqual(base[2])
  })
})

describe('applyProposedChanges (t16 multi-op Accept path)', () => {
  // Deterministic id minting so we can assert on the results.
  function counter() {
    let n = 0
    return () => `mint-${++n}`
  }

  it('creates: appends by default, stamping a minted id', () => {
    const change: ModuleChange = { op: 'create', data: { type: 'text', content: 'appended' } }
    const { blocks, applied, skipped } = applyProposedChanges(base, [change], counter())
    expect(applied).toBe(1)
    expect(skipped).toBe(0)
    expect(blocks).toHaveLength(base.length + 1)
    expect(blocks[blocks.length - 1]).toEqual({ id: 'mint-1', type: 'text', content: 'appended' })
  })

  it('creates: an `after` anchor inserts right after the target', () => {
    const change: ModuleChange = {
      op: 'create',
      after: 'a',
      data: { type: 'text', content: 'between' },
    }
    const { blocks } = applyProposedChanges(base, [change], counter())
    expect(blocks.map((b) => b.id)).toEqual(['a', 'mint-1', 'b', 'c'])
  })

  it('creates: a missing anchor falls back to append (branch 6)', () => {
    const change: ModuleChange = {
      op: 'create',
      after: 'ghost',
      data: { type: 'text', content: 'x' },
    }
    const { blocks } = applyProposedChanges(base, [change], counter())
    expect(blocks[blocks.length - 1].id).toBe('mint-1')
  })

  it('creates: same-anchor creates land in array order', () => {
    const changes: ModuleChange[] = [
      { op: 'create', after: 'a', data: { type: 'text', content: 'first' } },
      { op: 'create', after: 'a', data: { type: 'text', content: 'second' } },
    ]
    const { blocks } = applyProposedChanges(base, changes, counter())
    expect(blocks.map((b) => b.id)).toEqual(['a', 'mint-1', 'mint-2', 'b', 'c'])
  })

  it('creates: mints ids for nested todo items too (branch 2)', () => {
    const change: ModuleChange = {
      op: 'create',
      data: { type: 'todo', items: [{ label: 'buy milk', checked: false }] },
    }
    const { blocks } = applyProposedChanges(base, [change], counter())
    const created = blocks[blocks.length - 1]
    expect(created).toEqual({
      id: 'mint-1',
      type: 'todo',
      items: [{ id: 'mint-2', label: 'buy milk', checked: false }],
    })
  })

  it('edits: replaces data while preserving id and position', () => {
    const change: ModuleChange = {
      op: 'edit',
      blockId: 'b',
      data: { type: 'text', content: 'rewritten' },
    }
    const { blocks } = applyProposedChanges(base, [change], counter())
    expect(blocks.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(blocks.find((b) => b.id === 'b')).toEqual({
      id: 'b',
      type: 'text',
      content: 'rewritten',
    })
  })

  it('edits: may type-morph a block, keeping its id', () => {
    const change: ModuleChange = {
      op: 'edit',
      blockId: 'a',
      data: { type: 'todo', items: [{ label: 'now a task', checked: false }] },
    }
    const { blocks } = applyProposedChanges(base, [change], counter())
    const morphed = blocks.find((b) => b.id === 'a')
    expect(morphed).toEqual({
      id: 'a',
      type: 'todo',
      items: [{ id: 'mint-1', label: 'now a task', checked: false }],
    })
  })

  it('removes: filters the target block', () => {
    const change: ModuleChange = { op: 'remove', blockId: 'b' }
    const { blocks, applied } = applyProposedChanges(base, [change], counter())
    expect(applied).toBe(1)
    expect(blocks.map((b) => b.id)).toEqual(['a', 'c'])
  })

  it('skips ops targeting a missing block instead of failing the batch', () => {
    const changes: ModuleChange[] = [
      { op: 'remove', blockId: 'ghost' },
      { op: 'edit', blockId: 'ghost', data: { type: 'text', content: 'x' } },
      { op: 'create', data: { type: 'text', content: 'ok' } },
    ]
    const { blocks, applied, skipped } = applyProposedChanges(base, changes, counter())
    expect(applied).toBe(1)
    expect(skipped).toBe(2)
    expect(blocks).toHaveLength(base.length + 1)
  })

  it('skips a malformed change (re-validated before write, branch 7)', () => {
    // `value` should be a number; cast past the type to exercise the runtime gate.
    const change = {
      op: 'create',
      data: { type: 'metric', label: 'bad', value: 'lots' },
    } as unknown as ModuleChange
    const { blocks, applied, skipped } = applyProposedChanges(base, [change], counter())
    expect(applied).toBe(0)
    expect(skipped).toBe(1)
    expect(blocks).toEqual(base)
  })

  it('does not mutate the input array', () => {
    const change: ModuleChange = { op: 'remove', blockId: 'a' }
    const snapshot = JSON.parse(JSON.stringify(base))
    applyProposedChanges(base, [change], counter())
    expect(base).toEqual(snapshot)
  })
})
