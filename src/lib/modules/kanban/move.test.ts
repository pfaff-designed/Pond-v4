/**
 * Pure board-mutation tests (ticket-35). The drag/add/rename logic lives in `move.ts`
 * so it is provable without a DOM or pointer events; the view is a thin shell over
 * these, so covering them here + the story play tests covers the module.
 */
import { addCard, addColumn, moveCard, patchCard, removeCard, renameColumn } from './move'
import { emptyKanban, kanbanSchema } from './schema'
import type { KanbanBlock } from './schema'

const board: KanbanBlock = {
  id: 'k1',
  type: 'kanban',
  columns: [
    {
      id: 'todo',
      title: 'To do',
      cards: [
        { id: 'c1', title: 'Cut boards' },
        { id: 'c2', title: 'Sand' },
      ],
    },
    { id: 'doing', title: 'Doing', cards: [{ id: 'c3', title: 'Glue-up' }] },
    { id: 'done', title: 'Done', cards: [] },
  ],
}

describe('moveCard', () => {
  it('moves a card to the foot of the target column and removes it from the source', () => {
    const next = moveCard(board, 'c1', 'doing')
    expect(next.columns[0].cards.map((c) => c.id)).toEqual(['c2'])
    expect(next.columns[1].cards.map((c) => c.id)).toEqual(['c3', 'c1']) // appended at foot
  })

  it('is a no-op (same reference) when the card is already in the target column', () => {
    expect(moveCard(board, 'c1', 'todo')).toBe(board)
  })

  it('is a no-op for an unknown card or unknown column', () => {
    expect(moveCard(board, 'nope', 'doing')).toBe(board)
    expect(moveCard(board, 'c1', 'archive')).toBe(board)
  })

  it('does not mutate the input board', () => {
    const snapshot = JSON.stringify(board)
    moveCard(board, 'c1', 'done')
    expect(JSON.stringify(board)).toBe(snapshot)
  })
})

describe('addCard / removeCard / patchCard', () => {
  it('appends a card with the supplied id to a column foot', () => {
    const next = addCard(board, 'done', { title: 'Finish' }, 'c9')
    expect(next.columns[2].cards).toEqual([{ id: 'c9', title: 'Finish' }])
  })

  it('carries an optional note onto a new card', () => {
    const next = addCard(board, 'todo', { title: 'Route edges', note: 'round-over bit' }, 'c8')
    expect(next.columns[0].cards.at(-1)).toEqual({
      id: 'c8',
      title: 'Route edges',
      note: 'round-over bit',
    })
  })

  it('archives only the named card, wherever it lives', () => {
    const next = removeCard(board, 'c3')
    expect(next.columns[1].cards).toEqual([])
    expect(next.columns[0].cards).toHaveLength(2) // untouched
  })

  it('patches a single card title/note without disturbing siblings', () => {
    const next = patchCard(board, 'c2', { note: 'to 220 grit' })
    expect(next.columns[0].cards[1]).toEqual({ id: 'c2', title: 'Sand', note: 'to 220 grit' })
    expect(next.columns[0].cards[0]).toEqual({ id: 'c1', title: 'Cut boards' })
  })
})

describe('renameColumn / addColumn', () => {
  it('renames one column only', () => {
    const next = renameColumn(board, 'doing', 'In progress')
    expect(next.columns.map((c) => c.title)).toEqual(['To do', 'In progress', 'Done'])
  })

  it('appends an empty column with the supplied id', () => {
    const next = addColumn(board, 'Blocked', 'col-x')
    expect(next.columns.at(-1)).toEqual({ id: 'col-x', title: 'Blocked', cards: [] })
  })
})

describe('emptyKanban (manual creation, t37)', () => {
  it('is three empty columns To do / Doing / Done with minted ids, and is schema-valid', () => {
    let n = 0
    const board = emptyKanban('blk', () => `col-${n++}`)
    expect(board.columns.map((c) => c.title)).toEqual(['To do', 'Doing', 'Done'])
    expect(board.columns.every((c) => c.cards.length === 0)).toBe(true)
    expect(new Set(board.columns.map((c) => c.id)).size).toBe(3) // distinct ids
    expect(kanbanSchema.safeParse(board).success).toBe(true)
  })
})
