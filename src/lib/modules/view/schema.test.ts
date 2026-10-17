/**
 * `viewSchema`'s saved-views model (KAN-32) — a block without `views` reads as
 * one view built from its legacy `mode`+config; a block with `views` reads the
 * active one, falling back to `views[0]` when `activeViewId` is missing or stale.
 */
import {
  activeSavedView,
  addSavedView,
  applyConfigPatch,
  resolveActiveView,
  viewSchema,
  type ViewBlock,
} from './schema'

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

describe('resolveActiveView', () => {
  it('synthesizes a legacy block’s own mode+config when views is absent', () => {
    expect(resolveActiveView(legacyBlock)).toEqual({
      id: 'b-1',
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
    })
  })

  it('resolves the view matching activeViewId on a views-shaped block', () => {
    expect(resolveActiveView(multiViewBlock)).toEqual({
      id: 'v-timeline',
      label: 'timeline',
      kind: 'gantt',
      config: { startDate: 'p-start' },
    })
  })

  it('falls back to views[0] when activeViewId is missing or stale', () => {
    const missingActiveId: ViewBlock = { ...multiViewBlock, activeViewId: undefined }
    expect(resolveActiveView(missingActiveId).id).toBe('v-board')

    const staleActiveId: ViewBlock = { ...multiViewBlock, activeViewId: 'v-gone' }
    expect(resolveActiveView(staleActiveId).id).toBe('v-board')
  })
})

describe('activeSavedView', () => {
  it('returns a legacy block (no views) as an equivalent copy of itself', () => {
    expect(activeSavedView(legacyBlock)).toEqual(legacyBlock)
  })

  it('mirrors activeViewId’s view onto the block shape when no selectedId is given', () => {
    expect(activeSavedView(multiViewBlock)).toEqual({
      ...multiViewBlock,
      mode: 'gantt',
      groupBy: undefined,
      sort: undefined,
      filter: undefined,
      startDate: 'p-start',
      endDate: undefined,
      chart: undefined,
      bigNumber: undefined,
      collectionId: undefined,
    })
  })

  it('a selectedId overrides a stale activeViewId', () => {
    const staleActiveId: ViewBlock = { ...multiViewBlock, activeViewId: 'v-gone' }
    expect(activeSavedView(staleActiveId, 'v-board')).toEqual({
      ...staleActiveId,
      mode: 'board',
      groupBy: 'p-status',
      sort: undefined,
      filter: undefined,
      startDate: undefined,
      endDate: undefined,
      chart: undefined,
      bigNumber: undefined,
      collectionId: undefined,
    })
  })
})

describe('applyConfigPatch', () => {
  it('patches a legacy block’s top-level fields exactly like the old spread', () => {
    expect(applyConfigPatch(legacyBlock, { groupBy: 'p-priority' })).toEqual({
      ...legacyBlock,
      groupBy: 'p-priority',
    })
  })

  it('lands a multi-view patch on the active view alone, leaving the other untouched', () => {
    const untouchedBoardView = multiViewBlock.views![0]
    const patched = applyConfigPatch(multiViewBlock, { startDate: 'p-start-2' })

    expect(patched.views![1]).toEqual({
      id: 'v-timeline',
      label: 'timeline',
      kind: 'gantt',
      config: { startDate: 'p-start-2' },
    })
    expect(patched.views![0]).toEqual(untouchedBoardView)
    expect(patched.activeViewId).toBe('v-timeline')
    // Bit-for-bit: the untouched view is the SAME object, not a re-built copy.
    expect(patched.views![0]).toBe(untouchedBoardView)
  })
})

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

describe('viewSchema.parse', () => {
  it('parses a views-shaped block, every saved view’s id/kind/config intact', () => {
    const parsed = viewSchema.parse(multiViewBlock)
    expect(parsed.views).toEqual(multiViewBlock.views)
    expect(parsed.activeViewId).toBe('v-timeline')
  })

  it('parses a legacy block (no views) unchanged', () => {
    expect(viewSchema.parse(legacyBlock)).toEqual(legacyBlock)
  })

  it('the removed mode-flip tolerance: a patch on one saved view never writes another view’s config or the top level', () => {
    const parsed = viewSchema.parse(multiViewBlock)
    const patched = applyConfigPatch(parsed, { startDate: 'p-start-2' })

    expect(patched.views![1].config).toEqual({ startDate: 'p-start-2' })
    expect(patched.views![0]).toEqual(parsed.views![0])
    // Every top-level field (mode, groupBy, sort, …) is untouched by the patch.
    expect({ ...patched, views: undefined }).toEqual({ ...parsed, views: undefined })
  })
})
