/**
 * `viewSchema`'s saved-views model (KAN-32) — a block without `views` reads as
 * one view built from its legacy `mode`+config; a block with `views` reads the
 * active one, falling back to `views[0]` when `activeViewId` is missing or stale.
 */
import type { ViewConfigPatch } from './kinds'
import {
  activeSavedView,
  applyConfigPatch,
  resolveActiveView,
  viewSchema,
  type ViewBlock,
  type ViewMode,
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

describe('applyConfigPatch mode', () => {
  const kept = {
    groupBy: 'p-status',
    sort: { key: 'p-name', dir: 'asc' as const },
    filter: { property: 'p-name', op: 'eq' as const, value: 'standup' },
    startDate: 'p-start',
    endDate: 'p-end',
    chart: { kind: 'bar' as const, series: [{ property: 'p-n', agg: 'count' as const }] },
    bigNumber: { agg: 'count' as const },
    collectionId: 'col-1',
  }

  const legacy: ViewBlock = {
    id: 'b-legacy',
    type: 'view',
    mode: 'table',
    ...kept,
  }

  const rows = {
    id: 'v-table',
    label: 'rows',
    kind: 'table' as const,
    config: kept,
  }
  const lanes = {
    id: 'v-board',
    label: 'lanes',
    kind: 'board' as const,
    config: { groupBy: 'p-priority', sort: { key: 'p-rank', dir: 'desc' as const } },
  }
  const dates = {
    id: 'v-cal',
    label: 'dates',
    kind: 'calendar' as const,
    config: { startDate: 'p-due', filter: { property: 'p-open', op: 'eq' as const, value: 'yes' } },
  }

  const saved: ViewBlock = {
    id: 'b-saved',
    type: 'view',
    mode: 'list',
    groupBy: 'p-top',
    sort: { key: 'p-top-name', dir: 'desc' },
    views: [rows, lanes, dates],
    activeViewId: 'v-board',
  }

  const noActive: ViewBlock = { ...saved, activeViewId: undefined }

  const layoutPatch = (mode: ViewMode): ViewConfigPatch => ({ mode })

  it('ViewConfigPatch includes mode', () => {
    expect(layoutPatch('calendar').mode).toBe('calendar')
  })

  it.each<[string, ViewBlock, ViewConfigPatch, string | undefined, (block: ViewBlock, patched: ViewBlock) => void]>([
    [
      'legacy block writes top-level mode and leaves views absent',
      legacy,
      { mode: 'board' },
      undefined,
      (_block, patched) => {
        expect(patched.mode).toBe('board')
        expect(patched).not.toHaveProperty('views')
        expect(patched.id).toBe('b-legacy')
        expect(patched.groupBy).toBe(kept.groupBy)
        expect(patched.sort).toEqual(kept.sort)
        expect(patched.filter).toEqual(kept.filter)
        expect(patched.startDate).toBe(kept.startDate)
        expect(patched.endDate).toBe(kept.endDate)
        expect(patched.chart).toEqual(kept.chart)
        expect(patched.bigNumber).toEqual(kept.bigNumber)
        expect(patched.collectionId).toBe(kept.collectionId)
      },
    ],
    [
      'local activeId writes kind on that saved view only',
      saved,
      { mode: 'gallery' },
      'v-table',
      (block, patched) => {
        expect(patched.views?.[0]).toEqual({ ...rows, kind: 'gallery' })
        expect(patched.views?.[0]?.id).toBe('v-table')
        expect(patched.views?.[0]?.label).toBe('rows')
        expect(patched.views?.[0]?.config).toEqual(kept)
        expect(patched.views?.[1]).toBe(block.views?.[1])
        expect(patched.views?.[2]).toBe(block.views?.[2])
        expect(patched.mode).toBe('list')
        expect(patched.groupBy).toBe('p-top')
        expect(patched.sort).toEqual(block.sort)
        expect(patched.activeViewId).toBe('v-board')
      },
    ],
    [
      'activeViewId is the saved view when no local activeId is passed',
      saved,
      { mode: 'gantt' },
      undefined,
      (block, patched) => {
        expect(patched.views?.[1]).toEqual({ ...lanes, kind: 'gantt' })
        expect(patched.views?.[1]?.id).toBe('v-board')
        expect(patched.views?.[1]?.label).toBe('lanes')
        expect(patched.views?.[1]?.config).toEqual(lanes.config)
        expect(patched.views?.[0]).toBe(block.views?.[0])
        expect(patched.views?.[2]).toBe(block.views?.[2])
        expect(patched.mode).toBe('list')
        expect(patched.activeViewId).toBe('v-board')
      },
    ],
    [
      'views[0] is the saved view when activeViewId is absent',
      noActive,
      { mode: 'chart' },
      undefined,
      (block, patched) => {
        expect(patched.views?.[0]).toEqual({ ...rows, kind: 'chart' })
        expect(patched.views?.[0]?.id).toBe('v-table')
        expect(patched.views?.[0]?.label).toBe('rows')
        expect(patched.views?.[0]?.config).toEqual(kept)
        expect(patched.views?.[1]).toBe(block.views?.[1])
        expect(patched.views?.[2]).toBe(block.views?.[2])
        expect(patched.mode).toBe('list')
        expect(patched.activeViewId).toBeUndefined()
      },
    ],
    [
      'the same mode on a legacy block returns the same block',
      legacy,
      { mode: 'table' },
      undefined,
      (block, patched) => {
        expect(patched).toBe(block)
      },
    ],
    [
      'the same mode on the active saved view returns the same block',
      saved,
      { mode: 'board' },
      undefined,
      (block, patched) => {
        expect(patched).toBe(block)
      },
    ],
    [
      'the same mode on a local activeId returns the same block',
      saved,
      { mode: 'calendar' },
      'v-cal',
      (block, patched) => {
        expect(patched).toBe(block)
      },
    ],
    [
      'the same mode on views[0] returns the same block when activeViewId is absent',
      noActive,
      { mode: 'table' },
      undefined,
      (block, patched) => {
        expect(patched).toBe(block)
      },
    ],
    [
      'a patch with no mode on a legacy block stays today’s write',
      legacy,
      { groupBy: 'p-priority' },
      undefined,
      (block, patched) => {
        expect(patched).toEqual({ ...block, groupBy: 'p-priority' })
        expect(patched).not.toHaveProperty('views')
      },
    ],
    [
      'a patch with no mode on a views block stays today’s write',
      saved,
      { startDate: 'p-start-2' },
      undefined,
      (block, patched) => {
        expect(patched.views?.[1]).toEqual({
          ...lanes,
          config: { ...lanes.config, startDate: 'p-start-2' },
        })
        expect(patched.views?.[0]).toBe(block.views?.[0])
        expect(patched.views?.[2]).toBe(block.views?.[2])
        expect(patched.mode).toBe(block.mode)
        expect(patched.activeViewId).toBe(block.activeViewId)
        expect({ ...patched, views: undefined }).toEqual({ ...block, views: undefined })
      },
    ],
  ])('%s', (_name, block, patch, activeId, assert) => {
    assert(block, applyConfigPatch(block, patch, activeId))
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
