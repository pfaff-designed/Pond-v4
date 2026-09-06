/**
 * The `heatmap` render transform (#12) — the one non-mechanical piece of the
 * promotion. `toHeatmapGrid` bins the module's flat AI-emittable cells
 * (`{ date: 'YYYY-MM-DD', value }`) into the Bklit `HeatmapColumn[]` grid the
 * chart consumes: one column per Sunday-start week (GitHub-contributions
 * convention — the Bklit default `weekStartDay: 0`), one bin per weekday row,
 * with `xDomain` derived from the min/max cell date.
 *
 * Pinned here because the mapping is where a promotion silently rots: timezone
 * shifts (an ISO date parsed as UTC lands on the previous local day), week
 * boundaries, gap weeks, and duplicate dates all have to come out exactly right
 * for the grid to read as a calendar.
 */

import { parseIsoDateLocal, toHeatmapGrid } from '@/lib/modules/heatmap/data'

describe('parseIsoDateLocal', () => {
  it('parses YYYY-MM-DD as LOCAL midnight, never UTC', () => {
    // `new Date('2026-01-05')` is UTC midnight — in any negative-offset timezone
    // that is Jan 4 locally, which would shift every cell one row/column. The
    // transform must parse calendar components directly.
    const d = parseIsoDateLocal('2026-01-05')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(0)
    expect(d.getDay()).toBe(1) // 2026-01-05 is a Monday
  })
})

describe('toHeatmapGrid', () => {
  it('returns null for no cells (the view renders the calm empty state)', () => {
    expect(toHeatmapGrid([])).toBeNull()
  })

  it('a single cell yields one full 7-bin week column with the value on its weekday row', () => {
    const grid = toHeatmapGrid([{ date: '2026-01-05', value: 3 }])! // Monday
    expect(grid).not.toBeNull()
    expect(grid.columns).toHaveLength(1)
    const col = grid.columns[0]
    expect(col.bin).toBe(0)
    expect(col.bins).toHaveLength(7)
    // Sunday-first rows: bin index === date.getDay().
    expect(col.bins[0].date.getDate()).toBe(4) // the Sunday of that week
    expect(col.bins[1]).toMatchObject({ bin: 1, count: 3 })
    expect(col.bins[1].date.getDate()).toBe(5)
    expect(col.bins[6].date.getDate()).toBe(10) // Saturday closes the column
    // Every other day of the week is materialized as a zero cell, not a hole.
    expect(col.bins.filter((b) => b.count === 0)).toHaveLength(6)
  })

  it('bins cells into Sunday-start week columns × weekday rows', () => {
    const grid = toHeatmapGrid([
      { date: '2026-01-05', value: 1 }, // Mon, week of Jan 4
      { date: '2026-01-10', value: 2 }, // Sat, same week
      { date: '2026-01-11', value: 4 }, // Sun, NEXT week column
    ])!
    expect(grid.columns).toHaveLength(2)
    expect(grid.columns[0].bins[1].count).toBe(1)
    expect(grid.columns[0].bins[6].count).toBe(2)
    expect(grid.columns[1].bins[0].count).toBe(4)
    expect(grid.columns[1].bins[0].date.getDate()).toBe(11)
    // Every bin's row index is its weekday (Sunday-first, the Bklit default).
    for (const col of grid.columns) {
      col.bins.forEach((b, i) => {
        expect(b.bin).toBe(i)
        expect(b.date.getDay()).toBe(i)
      })
    }
  })

  it('is order-independent: unsorted cells produce the same grid', () => {
    const sorted = toHeatmapGrid([
      { date: '2026-01-05', value: 1 },
      { date: '2026-01-11', value: 4 },
    ])
    const unsorted = toHeatmapGrid([
      { date: '2026-01-11', value: 4 },
      { date: '2026-01-05', value: 1 },
    ])
    expect(unsorted).toEqual(sorted)
  })

  it('sums duplicate dates into one cell', () => {
    const grid = toHeatmapGrid([
      { date: '2026-01-05', value: 2 },
      { date: '2026-01-05', value: 3 },
    ])!
    expect(grid.columns[0].bins[1].count).toBe(5)
  })

  it('derives xDomain from the min and max cell date (local)', () => {
    const grid = toHeatmapGrid([
      { date: '2026-01-11', value: 4 },
      { date: '2026-01-05', value: 1 },
      { date: '2026-01-07', value: 2 },
    ])!
    const [start, end] = grid.xDomain
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(5)
    expect(end.getDate()).toBe(11)
  })

  it('materializes empty gap weeks so the calendar keeps its spacing', () => {
    const grid = toHeatmapGrid([
      { date: '2026-01-05', value: 1 }, // week of Jan 4
      { date: '2026-01-26', value: 2 }, // Monday, week of Jan 25 — 3 weeks later
    ])!
    expect(grid.columns).toHaveLength(4)
    expect(grid.columns.map((c) => c.bin)).toEqual([0, 1, 2, 3])
    // The two middle weeks are all-zero but present, with real consecutive dates.
    for (const col of [grid.columns[1], grid.columns[2]]) {
      expect(col.bins.every((b) => b.count === 0)).toBe(true)
    }
    expect(grid.columns[1].bins[0].date.getDate()).toBe(11)
    expect(grid.columns[3].bins[1].count).toBe(2)
  })

  it('steps dates across a DST transition without drifting off local midnight', () => {
    // US spring-forward is 2026-03-08 (a Sunday). Naive +24h stepping lands on
    // 23:00/01:00 and shears the calendar; setDate stepping must not.
    const grid = toHeatmapGrid([
      { date: '2026-03-08', value: 1 },
      { date: '2026-03-14', value: 2 },
    ])!
    expect(grid.columns).toHaveLength(1)
    const dates = grid.columns[0].bins.map((b) => b.date)
    dates.forEach((d, i) => {
      expect(d.getHours()).toBe(0)
      expect(d.getDate()).toBe(8 + i)
    })
  })
})
