/**
 * The compact chart presentation's pure half (#259) — the board's `bars` and `heat`
 * rules off `PondTemplate.dc.html`'s `renderVals()`, with the two fixtures the
 * board itself draws (`tracker › by week` and `dashboard › by week`) as the
 * non-tautological checks: the numbers the board shows must come out of the rule.
 */
import { CHART_KINDS, type ChartKind } from './aggregate'
import {
  COMPACT_CHART_MARK,
  COMPACT_MARK_EMPTY,
  HEAT_CELLS,
  barStrip,
  compactChartMark,
  heatGrid,
} from './chart-compact'
import type { ViewBlock } from './schema'

describe('COMPACT_CHART_MARK — which chart kind has a compact mark', () => {
  it('is exhaustive over CHART_KINDS', () => {
    expect(Object.keys(COMPACT_CHART_MARK).sort()).toEqual([...CHART_KINDS].sort())
  })

  it('bar → bars, heatmap → heat, every other kind has none', () => {
    expect(COMPACT_CHART_MARK.bar).toBe('bars')
    expect(COMPACT_CHART_MARK.heatmap).toBe('heat')
    for (const kind of CHART_KINDS) {
      if (kind === 'bar' || kind === 'heatmap') continue
      expect(COMPACT_CHART_MARK[kind]).toBeNull()
    }
  })

  it('bars is empty as the voidBox; heat draws its own empty grid', () => {
    expect(COMPACT_MARK_EMPTY).toEqual({ bars: 'void', heat: 'grid' })
  })
})

describe('compactChartMark — read off the block alone', () => {
  const chart = (kind: ChartKind, presentation?: 'card' | 'compact'): ViewBlock => ({
    id: 'v',
    type: 'view',
    mode: 'chart',
    chart: {
      kind,
      series: [{ property: 'p-km', agg: 'sum' }],
      ...(presentation ? { presentation } : {}),
    },
  })

  it('null for the default (card) presentation, so no shipped view changes', () => {
    expect(compactChartMark(chart('bar'))).toBeNull()
    expect(compactChartMark(chart('bar', 'card'))).toBeNull()
    expect(compactChartMark(chart('heatmap'))).toBeNull()
  })

  it('bars / heat at presentation compact', () => {
    expect(compactChartMark(chart('bar', 'compact'))).toBe('bars')
    expect(compactChartMark(chart('heatmap', 'compact'))).toBe('heat')
  })

  it('null for a compact kind with no mark, for an unconfigured chart, and for other modes', () => {
    expect(compactChartMark(chart('line', 'compact'))).toBeNull()
    expect(compactChartMark({ id: 'v', type: 'view', mode: 'chart' })).toBeNull()
    expect(compactChartMark({ id: 'v', type: 'view', mode: 'table' })).toBeNull()
  })
})

describe('barStrip — heights normalised to the max, last bar current', () => {
  it('the tracker fixture: [9,12,10,14,13,8,15,16,12,17,15,18] → round(h / 18 × 100)', () => {
    const strip = barStrip([9, 12, 10, 14, 13, 8, 15, 16, 12, 17, 15, 18])
    expect(strip.map((b) => b.height)).toEqual([50, 67, 56, 78, 72, 44, 83, 89, 67, 94, 83, 100])
  })

  it('the dashboard fixture: [6,9,7,11] → [55, 82, 64, 100]', () => {
    expect(barStrip([6, 9, 7, 11]).map((b) => b.height)).toEqual([55, 82, 64, 100])
  })

  it('normalises to the MAX, not a fixed ceiling — the tallest bar always fills the strip', () => {
    expect(barStrip([1, 2, 3]).map((b) => b.height)).toEqual([33, 67, 100])
    expect(barStrip([100, 200, 300]).map((b) => b.height)).toEqual([33, 67, 100])
    // Not the last: the max is wherever it is.
    expect(barStrip([30, 10]).map((b) => b.height)).toEqual([100, 33])
  })

  it('exactly the LAST bar is current — the period, not a highlight of the max', () => {
    const strip = barStrip([30, 10, 20])
    expect(strip.map((b) => b.current)).toEqual([false, false, true])
    expect(barStrip([7]).map((b) => b.current)).toEqual([true])
  })

  it('an empty series is an empty strip; all-zero draws every bar at 0, never NaN', () => {
    expect(barStrip([])).toEqual([])
    expect(barStrip([0, 0, 0]).map((b) => b.height)).toEqual([0, 0, 0])
  })

  it('a negative figure draws at 0 and does not set the max', () => {
    expect(barStrip([-5, 10]).map((b) => b.height)).toEqual([0, 100])
  })
})

describe('heatGrid — 84 cells, weeks as columns, three levels', () => {
  // Friday 2 Oct 2026. Its week starts Sunday 27 Sep; eleven weeks earlier is
  // Sunday 12 Jul. Local-time construction, as the calendar is.
  const today = new Date(2026, 9, 2)

  it('draws exactly 84 cells, all off, when there is nothing to read — no voidBox for heat', () => {
    const grid = heatGrid([], today)
    expect(grid).toHaveLength(HEAT_CELLS)
    expect(grid).toHaveLength(84)
    expect(grid.every((c) => c.level === 'off' && c.value === 0)).toBe(true)
  })

  it('cells run column-major: 0–6 the oldest week Sun→Sat, 77–83 the current week', () => {
    const grid = heatGrid([], today)
    expect(grid[0].date).toBe('2026-07-12') // Sunday, eleven weeks before the current week
    expect(grid[6].date).toBe('2026-07-18') // that week's Saturday closes the first column
    expect(grid[7].date).toBe('2026-07-19') // the next column starts on the next Sunday
    expect(grid[77].date).toBe('2026-09-27') // the current week's Sunday
    expect(grid[82].date).toBe('2026-10-02') // today, Friday = row 5 of the last column
    expect(grid[83].date).toBe('2026-10-03') // Saturday — a day not yet lived, still a cell
  })

  it('three levels only: recent (full ink) in the current week, on (.45) earlier, off (.07)', () => {
    const grid = heatGrid(
      [
        { date: '2026-10-02', value: 5 }, // today → recent
        { date: '2026-09-28', value: 1 }, // Monday of the current week → recent
        { date: '2026-09-18', value: 3 }, // two weeks back → on
        { date: '2026-07-12', value: 2 }, // the very first cell → on
      ],
      today
    )
    expect(grid[82]).toMatchObject({ date: '2026-10-02', value: 5, level: 'recent' })
    expect(grid[78]).toMatchObject({ date: '2026-09-28', value: 1, level: 'recent' })
    expect(grid.find((c) => c.date === '2026-09-18')).toMatchObject({ value: 3, level: 'on' })
    expect(grid[0]).toMatchObject({ value: 2, level: 'on' })
    expect(new Set(grid.map((c) => c.level))).toEqual(new Set(['off', 'on', 'recent']))
    expect(grid.filter((c) => c.level !== 'off')).toHaveLength(4)
  })

  it('a day is on only when its figure is ABOVE zero — a logged 0 is off', () => {
    const grid = heatGrid(
      [
        { date: '2026-09-18', value: 0 },
        { date: '2026-09-19', value: -2 },
      ],
      today
    )
    expect(grid.find((c) => c.date === '2026-09-18')!.level).toBe('off')
    expect(grid.find((c) => c.date === '2026-09-19')!.level).toBe('off')
  })

  it('duplicate dates sum (as toHeatmapGrid), and days outside the window are not drawn', () => {
    const grid = heatGrid(
      [
        { date: '2026-09-18', value: 1 },
        { date: '2026-09-18', value: 2 },
        { date: '2026-07-11', value: 9 }, // the Saturday before the first cell
        { date: '2026-10-04', value: 9 }, // the Sunday after the last cell
      ],
      today
    )
    expect(grid.find((c) => c.date === '2026-09-18')!.value).toBe(3)
    expect(grid.some((c) => c.date === '2026-07-11')).toBe(false)
    expect(grid.some((c) => c.date === '2026-10-04')).toBe(false)
    expect(grid.filter((c) => c.level !== 'off')).toHaveLength(1)
  })

  it('MOVES when a record changes — nothing holds a copy (#111)', () => {
    const before = heatGrid([{ date: '2026-09-18', value: 1 }], today)
    const after = heatGrid([{ date: '2026-09-19', value: 1 }], today)
    expect(before.find((c) => c.date === '2026-09-18')!.level).toBe('on')
    expect(after.find((c) => c.date === '2026-09-18')!.level).toBe('off')
    expect(after.find((c) => c.date === '2026-09-19')!.level).toBe('on')
  })
})
