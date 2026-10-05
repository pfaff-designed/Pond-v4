import { foldedTurnCount, groupTurns } from '@/lib/conversation/turns'
import { areaOf } from '@/lib/pages/crumbs'

const user = (requestChanges = false) => ({
  role: 'user',
  metadata: requestChanges ? { requestChanges: true } : undefined,
})
const assistant = { role: 'assistant' }

describe('groupTurns', () => {
  it('starts a turn at every question', () => {
    expect(groupTurns([user(), assistant, user(), assistant])).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('keeps a request-changes note and its revision inside the turn they answer', () => {
    expect(groupTurns([user(), assistant, user(true), assistant])).toEqual([[0, 1, 2, 3]])
  })

  it('gives a leading answer with no question a turn of its own', () => {
    expect(groupTurns([assistant, user(), assistant])).toEqual([[0], [1, 2]])
  })

  it('is empty for an empty thread', () => {
    expect(groupTurns([])).toEqual([])
  })
})

describe('foldedTurnCount', () => {
  it('keeps only the latest turn open: one turn folds nothing, two fold one', () => {
    expect([0, 1, 2, 3, 7].map((n) => foldedTurnCount(n))).toEqual([0, 0, 1, 2, 6])
  })
})

describe('areaOf', () => {
  const rows = [
    { id: 'life', parentId: null, title: 'life' },
    { id: 'kitchen', parentId: 'life', title: 'kitchen renovation' },
    { id: 'quotes', parentId: 'kitchen', title: '' },
    { id: 'a', parentId: 'b', title: 'a' },
    { id: 'b', parentId: 'a', title: 'b' },
  ]

  it('names the top-level ancestor', () => {
    expect(areaOf(rows, 'quotes')).toBe('life')
    expect(areaOf(rows, 'kitchen')).toBe('life')
  })

  it('names a top-level page as its own area', () => {
    expect(areaOf(rows, 'life')).toBe('life')
  })

  it('is null for a page that is not in the rows', () => {
    expect(areaOf(rows, 'gone')).toBeNull()
  })

  it('terminates on a cycle', () => {
    expect(areaOf(rows, 'a')).not.toBeUndefined()
  })
})
