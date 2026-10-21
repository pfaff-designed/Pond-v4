/**
 * `withUndoneRemove` — the pure re-insert `usePageDraft.undoRemove` runs on Undo
 * (ticket-44 review). KAN-440: a removal that handed `rowStart` off to a row-mate
 * (`detachKeepingRows`) must give it back on undo, or `[X rs][Y rs]` stays split
 * for good after Undo re-inserts X.
 */

import { withUndoneRemove } from '@/lib/pages/use-page-draft'
import type { Block } from '@/lib/documents/types'

describe('withUndoneRemove', () => {
  it('re-inserts the removed block at its old index with no handoff to reverse', () => {
    const a: Block = { id: 'a', type: 'text', content: 'a' }
    const x: Block = { id: 'x', type: 'text', content: 'x' }
    const y: Block = { id: 'y', type: 'text', content: 'y' }
    expect(withUndoneRemove([a, y], 1, x)).toEqual([a, x, y])
  })

  it('deleting a rowStart holder then undoing restores [X rs, Y] in one row, Y without rowStart', () => {
    const x: Block = { id: 'x', type: 'text', content: 'x', width: '1/2', rowStart: true }
    const y: Block = { id: 'y', type: 'text', content: 'y', width: '1/2' }
    // The state right after `detachKeepingRows` handed `rowStart` to y.
    const afterDelete: Block[] = [{ ...y, rowStart: true }]
    expect(withUndoneRemove(afterDelete, 0, x, 'y')).toEqual([x, y])
  })

  it('undoing a removal that handed off to a DIFFERENT block never touches an unrelated block that genuinely holds its own rowStart', () => {
    const z: Block = { id: 'z', type: 'text', content: 'z', width: '1/2' }
    const y: Block = { id: 'y', type: 'text', content: 'y', width: '1/2', rowStart: true }
    // z was deleted (no rowStart, no handoff); y's own rowStart is unrelated.
    expect(withUndoneRemove([y], 0, z, null)).toEqual([z, y])
  })
})
