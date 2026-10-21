import { addSavedView } from './saved-views'
import type { ViewBlock } from './schema'

const legacyBlock: ViewBlock = {
  id: 'b-1',
  type: 'view',
  mode: 'board',
  groupBy: 'p-status',
  sort: { key: 'p-name', dir: 'asc' },
}

const multiViewBlock: ViewBlock = {
  id: 'b-2',
  type: 'view',
  mode: 'board',
  label: 'tasks',
  views: [
    { id: 'v-board', label: 'board', kind: 'board', config: { groupBy: 'p-status' } },
    { id: 'v-timeline', label: 'timeline', kind: 'gantt', config: { startDate: 'p-start' } },
  ],
  activeViewId: 'v-timeline',
}

describe('addSavedView', () => {
  const countingMintId = () => {
    let n = 0
    return () => `id-${n++}`
  }

  it('converts a legacy block to views[0] (mode+config mirrored, top level untouched) and appends the new view as active', () => {
    const added = addSavedView(legacyBlock, 'table', countingMintId())

    expect(added.views).toEqual([
      {
        id: 'id-0',
        label: undefined,
        kind: 'board',
        config: {
          groupBy: 'p-status',
          sort: { key: 'p-name', dir: 'asc' },
          filter: undefined,
          startDate: undefined,
          endDate: undefined,
          chart: undefined,
          bigNumber: undefined,
          collectionId: undefined,
        },
      },
      { id: 'id-1', label: 'table', kind: 'table', config: {} },
    ])
    expect(added.activeViewId).toBe('id-1')
    // Dead top-level fields survive the conversion untouched.
    expect(added.mode).toBe('board')
    expect(added.groupBy).toBe('p-status')
  })

  it('a legacy block whose own kind effectively collides with the new mode gets " 2" (1 prior collision)', () => {
    const added = addSavedView(legacyBlock, 'board', countingMintId())

    // views[0] wraps the legacy 'board' mode with no custom label, so its
    // effective label is VIEW_KINDS.board.label — the same base the new view wants.
    expect(added.views![1]).toEqual({ id: 'id-1', label: 'board 2', kind: 'board', config: {} })
    expect(added.activeViewId).toBe('id-1')
  })

  it('two prior effective "board"-labelled views collide onto " 3" (2 prior collisions)', () => {
    const block: ViewBlock = {
      id: 'b-3',
      type: 'view',
      mode: 'table',
      views: [
        { id: 'v1', kind: 'board', config: {} },
        { id: 'v2', label: 'Board 2', kind: 'table', config: {} },
      ],
      activeViewId: 'v1',
    }

    const added = addSavedView(block, 'board', countingMintId())

    expect(added.views).toHaveLength(3)
    expect(added.views![2]).toEqual({ id: 'id-0', label: 'board 3', kind: 'board', config: {} })
    expect(added.activeViewId).toBe('id-0')
  })

  it('collision checking is case-insensitive against a custom label', () => {
    const block: ViewBlock = {
      id: 'b-4',
      type: 'view',
      mode: 'table',
      views: [{ id: 'v1', label: 'Table', kind: 'gallery', config: {} }],
      activeViewId: 'v1',
    }

    const added = addSavedView(block, 'table', countingMintId())

    expect(added.views![1]).toEqual({ id: 'id-0', label: 'table 2', kind: 'table', config: {} })
  })

  it('appending to an already multi-view block leaves the prior views untouched', () => {
    const added = addSavedView(multiViewBlock, 'table', countingMintId())

    expect(added.views![0]).toBe(multiViewBlock.views![0])
    expect(added.views![1]).toBe(multiViewBlock.views![1])
    expect(added.views![2]).toEqual({ id: 'id-0', label: 'table', kind: 'table', config: {} })
    expect(added.activeViewId).toBe('id-0')
  })
})
