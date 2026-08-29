/**
 * Pure board mutations for the kanban view (ticket-35). Kept out of the component
 * so the move/add/rename logic is jest-testable without a DOM or pointer events —
 * every interaction in `view.tsx` funnels through these, then emits the whole new
 * block via `onChange` (full-state, per the t12 contract; no ops vocabulary).
 *
 * All functions are immutable: they return a NEW `KanbanBlock`, never mutate.
 */
import type { KanbanBlock, KanbanCard } from './schema'

/**
 * Move a card to the foot of another column. A no-op (returns the same reference)
 * when the card is already in the target column or either id is unknown — so a drop
 * onto a card's own column doesn't churn state or reorder it. Cross-column only:
 * within-column reordering is out of scope (spec: "drag card BETWEEN columns").
 */
export function moveCard(board: KanbanBlock, cardId: string, toColumnId: string): KanbanBlock {
  const from = board.columns.find((c) => c.cards.some((card) => card.id === cardId))
  if (!from || from.id === toColumnId) return board
  if (!board.columns.some((c) => c.id === toColumnId)) return board
  const card = from.cards.find((c) => c.id === cardId)!
  return {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id === from.id) return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
      if (col.id === toColumnId) return { ...col, cards: [...col.cards, card] }
      return col
    }),
  }
}

/** Append a card (title, optional note) to the foot of a column. */
export function addCard(
  board: KanbanBlock,
  columnId: string,
  card: Omit<KanbanCard, 'id'>,
  id: string
): KanbanBlock {
  return {
    ...board,
    columns: board.columns.map((col) =>
      col.id === columnId ? { ...col, cards: [...col.cards, { id, ...card }] } : col
    ),
  }
}

/** Remove (archive) a card from wherever it lives. */
export function removeCard(board: KanbanBlock, cardId: string): KanbanBlock {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => c.id !== cardId),
    })),
  }
}

/** Patch a single card's fields (title/note) in place. */
export function patchCard(
  board: KanbanBlock,
  cardId: string,
  patch: Partial<Omit<KanbanCard, 'id'>>
): KanbanBlock {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    })),
  }
}

/** Rename a column. */
export function renameColumn(board: KanbanBlock, columnId: string, title: string): KanbanBlock {
  return {
    ...board,
    columns: board.columns.map((col) => (col.id === columnId ? { ...col, title } : col)),
  }
}

/** Append a new empty column. */
export function addColumn(board: KanbanBlock, title: string, id: string): KanbanBlock {
  return { ...board, columns: [...board.columns, { id, title, cards: [] }] }
}
