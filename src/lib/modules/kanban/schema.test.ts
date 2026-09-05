/**
 * Kanban descriptor tests (ticket-35): honest serialize text + the deep-path
 * (`columns.cards`) id walkers this module introduced. The registry/union wiring is
 * covered by the shared fences (module-exhaustiveness, ai-composition, nested-ids).
 */
import { kanbanDescriptor } from './schema'
import type { KanbanBlock } from './schema'
import { hydrateBlock } from '../hydrate'
import { stampDisplayIds } from '../preview'
import type { ModuleData } from '../ai-composition'

/**
 * #19 slice 6: kanban is retired from CREATION, so its id-less emit shape is no longer a
 * member of `ModuleData` (the AI can't mint one). But the deep-path id walkers stay wired
 * for READ-tolerance — a persisted kanban must still hydrate + stamp — so these tests feed
 * the walkers a loosely-typed kanban emit and cast at the composition-typed call sites.
 */
type KanbanEmit = {
  type: 'kanban'
  columns: { title: string; cards: { title: string; note?: string }[] }[]
}

const board: KanbanBlock = {
  id: 'k1',
  type: 'kanban',
  title: 'Bookshelf build',
  columns: [
    { id: 'c-todo', title: 'To do', cards: [{ id: 'a', title: 'Cut boards' }] },
    { id: 'c-doing', title: 'Doing', cards: [{ id: 'b', title: 'Sand', note: 'to 220 grit' }] },
    { id: 'c-done', title: 'Done', cards: [] },
  ],
}

describe('kanban serialize (honest text)', () => {
  it('renders the title, per-column counts, and every card title (+ note)', () => {
    const text = kanbanDescriptor.serialize(board)
    expect(text).toContain('Bookshelf build')
    expect(text).toContain('To do (1): Cut boards')
    expect(text).toContain('Sand (to 220 grit)') // note carried, so an edit can't destroy it
    expect(text).toContain('Done (0): —') // empty column reads honestly
  })

  it('preview is the short per-column count line', () => {
    expect(kanbanDescriptor.preview!(board)).toBe('To do 1 · Doing 1 · Done 0')
  })
})

describe('deep-path id walkers (columns.cards)', () => {
  const emitted: KanbanEmit = {
    type: 'kanban',
    columns: [
      { title: 'To do', cards: [{ title: 'Cut' }, { title: 'Sand' }] },
      { title: 'Done', cards: [] },
    ],
  }

  it('hydrateBlock mints ids at BOTH levels (block, columns, cards) and validates', () => {
    let n = 0
    const block = hydrateBlock(emitted, 'blk', () => `mint-${n++}`)
    expect(block).not.toBeNull()
    const kb = block as KanbanBlock
    expect(kb.id).toBe('blk')
    expect(kb.columns.every((c) => c.id.startsWith('mint-'))).toBe(true)
    const cardIds = kb.columns.flatMap((c) => c.cards.map((card) => card.id))
    expect(cardIds).toHaveLength(2)
    expect(cardIds.every((id) => id.startsWith('mint-'))).toBe(true)
    expect(new Set([...kb.columns.map((c) => c.id), ...cardIds]).size).toBe(4) // all distinct
  })

  it('stampDisplayIds gives every column and card a deterministic display id', () => {
    // Cast through the composition type: the stamp still handles kanban for read-tolerance,
    // but the union no longer lists it (retired from creation, #19 slice 6).
    const block = stampDisplayIds(emitted as unknown as ModuleData, 'pv') as KanbanBlock
    expect(block.columns.map((c) => c.id)).toEqual(['pv-0', 'pv-1'])
    // cards get a fresh per-path counter across all columns → unique keys
    expect(block.columns[0].cards.map((c) => c.id)).toEqual(['pv-0', 'pv-1'])
  })
})
