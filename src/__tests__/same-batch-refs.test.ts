/**
 * Same-batch bindings (ticket-31) — the batch-local `bindKey` → minted-id machinery.
 *
 * A create (a propose_changes op or a create_page block entry) may carry a
 * batch-local `bindKey`; `collectBatchRefIds` mints one id per valid key and
 * remembers it across calls, so per-change accepts split over several clicks land on
 * the SAME id. `resolveSourceRef` rewrites a `source.ref` to that id, and drops the
 * whole `source` for a ref that never resolves — a binding never dangles.
 *
 * #111 deleted the `metric` block, which was the only emitter of a `source.ref`, and
 * with it the end-to-end binding cases that used to live here (bind a metric to a
 * checklist created in the same batch, in either accept order, with a rejected or
 * invalid source). Those asserted behaviour that no longer exists, so they are gone
 * rather than rewritten. The resolver itself still runs on every accept — it is a
 * plain-object transform with no schema import, kept for whatever binds next — so
 * these unit tests pin it directly.
 */
import { collectBatchRefIds, resolveSourceRef } from '@/lib/modules/same-batch-refs'

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

describe('resolveSourceRef (the ref→id rewrite)', () => {
  const refs = new Map([['chores', 'blk-123']])

  it('rewrites a source.ref to the resolved blockId', () => {
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

  it('leaves an unbound block and a block of another type untouched', () => {
    const unbound = { type: 'metric', label: 'x', value: 3 }
    expect(resolveSourceRef(unbound, refs)).toEqual(unbound)
    const text = { type: 'text', content: 'hi' }
    expect(resolveSourceRef(text, refs)).toEqual(text)
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
