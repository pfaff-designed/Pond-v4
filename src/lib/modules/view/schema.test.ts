/**
 * `viewSchema`'s saved-views model (KAN-32) — a block without `views` reads as
 * one view built from its legacy `mode`+config; a block with `views` reads the
 * active one, falling back to `views[0]` when `activeViewId` is missing or stale.
 */
import { applyConfigPatch, resolveActiveView, viewSchema, type ViewBlock } from './schema'

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
