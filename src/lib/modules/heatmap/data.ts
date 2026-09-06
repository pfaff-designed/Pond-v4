import { getHeatmapWeekStartSunday } from '@/components/charts/heatmap/heatmap-utils'
// Type-only: heatmap-context is 'use client' but the import is erased at compile,
// so this file stays server-safe (mirrors chart/data.ts, which the serialize facet
// shares with the view).
import type { HeatmapColumn } from '@/components/charts/heatmap/heatmap-context'

/**
 * `heatmap` DATA contract (#12) — mirrors chart/data.ts. The AI/persisted shape is
 * deliberately FLAT — one `{ date, value }` per active day — not the Bklit
 * column-of-bins grid, which is wide, positional, and easy to emit wrong. The
 * module boundary owns the grid mapping (`toHeatmapGrid`, below), not the AI.
 */

/**
 * One day's cell: an ISO `YYYY-MM-DD` calendar date plus its numeric value.
 * Days with no activity are simply absent (rendered as empty cells, not listed
 * as zeros).
 */
export interface HeatmapCell {
  date: string
  value: number
}

/**
 * Parse an ISO `YYYY-MM-DD` as LOCAL midnight. `new Date('2026-01-05')` is UTC
 * midnight — in any negative-offset timezone that is Jan 4 *locally*, which
 * would shift every cell one row (and sometimes one column). The grid is a
 * calendar, so calendar components are parsed directly.
 */
export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The render-ready grid: Bklit columns plus the derived visible time range. */
export interface HeatmapGrid {
  columns: HeatmapColumn[]
  /** Min/max cell date — handed to the Bklit chart's `xDomain`. */
  xDomain: [Date, Date]
}

/**
 * Bin flat cells into the Bklit `HeatmapColumn[]` grid: one column per
 * Sunday-start week (the GitHub-contributions convention and the Bklit default,
 * `weekStartDay: 0`), one bin per weekday row (`bin === date.getDay()`). Every
 * week from the min cell's week to the max cell's week is materialized with a
 * full 7 bins — zero-count days and empty gap weeks keep the calendar's spacing
 * honest. Duplicate dates sum. Returns null for no cells (the view renders the
 * calm empty state).
 */
export function toHeatmapGrid(cells: readonly HeatmapCell[]): HeatmapGrid | null {
  if (cells.length === 0) return null

  const byDay = new Map<number, number>()
  let min: Date | null = null
  let max: Date | null = null
  for (const cell of cells) {
    const date = parseIsoDateLocal(cell.date)
    byDay.set(date.getTime(), (byDay.get(date.getTime()) ?? 0) + cell.value)
    if (min === null || date < min) min = date
    if (max === null || date > max) max = date
  }
  if (min === null || max === null) return null

  const firstSunday = getHeatmapWeekStartSunday(min)
  const lastSunday = getHeatmapWeekStartSunday(max)
  // Week count via calendar stepping (setDate), NOT millisecond division — a DST
  // transition makes one week 167/169 hours long and would shear the columns.
  const columns: HeatmapColumn[] = []
  const weekStart = new Date(firstSunday)
  for (let week = 0; weekStart.getTime() <= lastSunday.getTime(); week++) {
    const bins = Array.from({ length: 7 }, (_, day) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + day)
      return { bin: day, count: byDay.get(date.getTime()) ?? 0, date }
    })
    columns.push({ bin: week, bins })
    weekStart.setDate(weekStart.getDate() + 7)
  }

  return { columns, xDomain: [min, max] }
}

/**
 * Honest text summary for `serialize` (the prompt body + embedding source):
 * day count, total, and the peak day — so the AI's context matches what the user
 * sees without dumping every cell. Mirrors `summarizeChart` (chart/data.ts):
 * head + optional title, ` — caption`, then the figures.
 */
export function summarizeHeatmap(data: {
  title?: string
  caption?: string
  cells: readonly HeatmapCell[]
}): string {
  const head = `Heatmap${data.title ? ` "${data.title}"` : ''}`
  if (data.cells.length === 0) return `${head}: (no data)`
  let total = 0
  let peak = data.cells[0]
  for (const cell of data.cells) {
    total += cell.value
    if (cell.value > peak.value) peak = cell
  }
  const cap = data.caption ? ` — ${data.caption}` : ''
  const days = `${data.cells.length} ${data.cells.length === 1 ? 'day' : 'days'}`
  return `${head} over ${days}${cap}; total ${total}, peak ${peak.value} on ${peak.date}`
}
