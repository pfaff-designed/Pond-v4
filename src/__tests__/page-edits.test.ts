/**
 * Unit tests for applyProposedEdit — the pure block-replacement used by the
 * diff-card Accept path (ticket-10). Accepting an AI proposal replaces the
 * content of the target block (by its stable id) and writes the whole array.
 */

import { applyProposedEdit } from '@/lib/pages/edits'
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
