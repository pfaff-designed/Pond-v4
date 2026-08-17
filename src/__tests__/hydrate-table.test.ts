/**
 * hydrateBlock — table nested-id case (M3).
 *
 * Table rows carry their own ids (like todo items); the AI emits id-less rows and
 * hydrateBlock must mint them, or blockSchema validation fails and the block is
 * silently dropped (a table the user accepted would vanish). Red-first for M3.
 */
import { hydrateBlock } from '@/lib/modules/hydrate'

describe('hydrateBlock — table rows', () => {
  let n: number
  const mint = () => `id-${++n}`
  beforeEach(() => {
    n = 0
  })

  it('mints ids for the block AND each nested table row', () => {
    const data = {
      type: 'table',
      title: 'Tools',
      columns: ['Name', 'Qty'],
      rows: [{ cells: ['Hammer', '2'] }, { cells: ['Saw', '1'] }],
    }
    const block = hydrateBlock(data, 'blk-1', mint)
    expect(block).toEqual({
      id: 'blk-1',
      type: 'table',
      title: 'Tools',
      columns: ['Name', 'Qty'],
      rows: [
        { id: 'id-1', cells: ['Hammer', '2'] },
        { id: 'id-2', cells: ['Saw', '1'] },
      ],
    })
  })

  it('drops row ids the model volunteered and re-mints them', () => {
    const data = {
      type: 'table',
      columns: ['Name'],
      rows: [{ id: 'model-made-this-up', cells: ['Hammer'] }],
    }
    const block = hydrateBlock(data, 'blk-1', mint)
    expect(block).not.toBeNull()
    expect((block as { rows: { id: string }[] }).rows[0].id).toBe('id-1')
  })

  it('hydrates an empty-rows table (columns only)', () => {
    const data = { type: 'table', columns: ['Name', 'Qty'], rows: [] }
    const block = hydrateBlock(data, 'blk-1', mint)
    expect(block).toEqual({ id: 'blk-1', type: 'table', columns: ['Name', 'Qty'], rows: [] })
  })

  it('rejects a malformed table (no columns) rather than writing corrupt JSON', () => {
    const data = { type: 'table', columns: [], rows: [] }
    expect(hydrateBlock(data, 'blk-1', mint)).toBeNull()
  })
})
