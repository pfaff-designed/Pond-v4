// Blast-radius helpers (ticket-27): descendant count, subtree id set, and the
// derived confirm-gating + copy. Pure tree logic — the count that the styled
// confirm modal states, and the seam that decides modal vs. straight-to-undo.

import {
  countDescendants,
  subtreeIds,
  subtreeIdsFromRows,
  needsConfirm,
  blastRadiusLabel,
} from '@/lib/deletion/blast-radius'

interface N {
  id: string
  children: N[]
}
const n = (id: string, children: N[] = []): N => ({ id, children })

describe('countDescendants', () => {
  it('is 0 for a leaf', () => {
    expect(countDescendants(n('a'))).toBe(0)
  })

  it('counts direct children', () => {
    expect(countDescendants(n('a', [n('b'), n('c')]))).toBe(2)
  })

  it('counts to arbitrary depth (children + grandchildren)', () => {
    const tree = n('health', [n('sleep'), n('marathon', [n('week1'), n('week2', [n('day1')])])])
    // sleep, marathon, week1, week2, day1 = 5
    expect(countDescendants(tree)).toBe(5)
  })
})

describe('subtreeIds', () => {
  it('includes the node itself plus every descendant', () => {
    const tree = n('a', [n('b', [n('c')]), n('d')])
    expect(subtreeIds(tree)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('is just the node for a leaf', () => {
    expect(subtreeIds(n('solo'))).toEqual(new Set(['solo']))
  })
})

describe('subtreeIdsFromRows', () => {
  const rows = [
    { id: 'life', parent_id: null },
    { id: 'house', parent_id: 'life' },
    { id: 'roof', parent_id: 'house' },
    { id: 'tile', parent_id: 'roof' },
    { id: 'garden', parent_id: 'life' },
  ]

  it('is just the node for a leaf', () => {
    expect(subtreeIdsFromRows(rows, 'tile')).toEqual(new Set(['tile']))
  })

  it('includes one direct child', () => {
    expect(subtreeIdsFromRows(rows, 'roof')).toEqual(new Set(['roof', 'tile']))
  })

  it('includes a grandchild', () => {
    expect(subtreeIdsFromRows(rows, 'house')).toEqual(new Set(['house', 'roof', 'tile']))
  })

  it('does not include a sibling subtree', () => {
    const ids = subtreeIdsFromRows(rows, 'house')
    expect(ids.has('garden')).toBe(false)
  })
})

describe('needsConfirm', () => {
  it('skips the modal for a leaf (0 descendants)', () => {
    expect(needsConfirm(0)).toBe(false)
  })

  it('requires the modal for a subtree', () => {
    expect(needsConfirm(1)).toBe(true)
    expect(needsConfirm(12)).toBe(true)
  })
})

describe('blastRadiusLabel', () => {
  it('is singular for one page inside', () => {
    expect(blastRadiusLabel(1)).toBe('Deletes 1 page inside.')
  })

  it('is plural otherwise', () => {
    expect(blastRadiusLabel(3)).toBe('Deletes 3 pages inside.')
  })
})
