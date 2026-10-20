/**
 * The calendar view's month span — the pure grid math `PondCalendar.dc.html`'s
 * `renderVals()` does for `span === 'month'` (#262 1/3), kept apart from the React
 * renderer in `collection-calendar.tsx` so it's directly unit-testable (mirrors
 * `gantt-shared.ts`'s split of layout from drawing). Dates are UTC throughout —
 * `epochDay`/`addDays` from `apply.ts` for day arithmetic, `Date.UTC` for month
 * arithmetic — never local time, so the grid never shears across a timezone or a
 * DST boundary. A range is two date properties (`pickGanttDefs`): when the end
 * day is after the start day the row is a bar (`layoutMonthBars`), and with an
 * end property present it leaves the day chips.
 */
import { coerceValue, type PropertyDef } from '@/lib/properties/schema'
import { addDays, epochDay, type CollectionRow } from './apply'

/** `PondCalendar.dc.html`'s `MON` — lowercase, the board's own form for `periodLabel`. */
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const

/** A day's up to 3 dated rows (DC: `onDay(t).slice(0,3)`), plus how many more didn't
 *  fit — the DC's `＋{n} more` overflow label reads `moreCount`. */
export interface MonthDayCell {
  iso: string
  dayOfMonth: number
  /** Whether this day falls in the focused month — the DC's `inM`, dims the number otherwise. */
  inMonth: boolean
  isToday: boolean
  items: CollectionRow[]
  moreCount: number
}

export interface MonthWeek {
  days: MonthDayCell[]
}

export interface MonthGrid {
  /** `{month} {year}`, lowercase per the DC's `MON` — e.g. `september 2026`. */
  periodLabel: string
  weeks: MonthWeek[]
}

/** `{ year, month0 }` from a `YYYY-MM-DD` string, 0-indexed month like `Date.UTC`. */
function parseYearMonth(iso: string): { year: number; month0: number } {
  const [year, month] = iso.split('-').map(Number)
  return { year, month0: month - 1 }
}

/** The `YYYY-MM-DD` for a UTC year/month/day, letting `Date.UTC` roll an out-of-range
 *  month (`-1`, `12`) into the adjacent year — how the DC steps months without a branch. */
function isoFromYearMonth(year: number, month0: number, day: number): string {
  return new Date(Date.UTC(year, month0, day)).toISOString().slice(0, 10)
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/** Monday-first weekday index — the DC's `dow`: `(getUTCDay()+6)%7`. */
function mondayDow(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** A row's date value, bucketed to its `YYYY-MM-DD` day part — `null` for an
 *  undated row, which the month span never shows. Exported so a drop handler can
 *  compare a row's own day against the drop target without re-deriving it. */
export function rowDateIso(row: CollectionRow, dateDef: PropertyDef): string | null {
  const value = coerceValue(dateDef, row.values[dateDef.id])
  return typeof value === 'string' && value ? value.slice(0, 10) : null
}

/** A `YYYY-MM-DD` day from an ISO string, or null when the value does not parse.
 *  The day is the leading date part; a time suffix stays on the stored value
 *  and is not part of the comparison. */
function parseDay(iso: string | null): string | null {
  if (typeof iso !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? match[0] : null
}

/** The board's `multi` (`o.end > o.start`): true only when both days parse and
 *  the end day is strictly after the start. A missing end, an equal day, or an
 *  end before the start stays a single-day chip. */
export function isMonthBar(startIso: string | null, endIso: string | null): boolean {
  const start = parseDay(startIso)
  const end = parseDay(endIso)
  return start !== null && end !== null && end > start
}

/** One range a month can draw across weeks. Dates stay ISO strings. */
export interface MonthBar {
  id: string
  title: string
  startIso: string
  endIso: string
}

/** One week-clipped piece of a bar. `columnEnd` is exclusive (Mon–Wed is 1 / 4). */
export interface MonthBarSegment {
  rowId: string
  title: string
  weekStart: string
  lane: number
  columnStart: number
  columnEnd: number
  squareLeft: boolean
  squareRight: boolean
}

/**
 * Lay range bars onto week rows. `weekStarts` are Mondays (`YYYY-MM-DD`). Each
 * bar that touches a week (clipped to Monday–Sunday) yields one segment; a week
 * with no bar yields none. Columns are the clipped day's Monday-index (Monday
 * is 0): start is `index + 1`, end is `index + 2`. `squareLeft` / `squareRight`
 * mark a bar that continues past that Monday / Sunday. Lanes follow the board's
 * `lanesFor`: sort by start, then the first lane whose stored end is strictly
 * before `max(bar.start, weekStart)`, otherwise a new lane. The stored end is
 * the bar's own end, not the clipped one.
 */
export function layoutMonthBars(
  weekStarts: readonly string[],
  bars: readonly MonthBar[]
): MonthBarSegment[] {
  const segments: MonthBarSegment[] = []
  for (const weekStart of weekStarts) {
    const monday = parseDay(weekStart)
    if (monday === null) continue
    const sunday = addDays(monday, 6)
    const touching: { id: string; title: string; start: string; end: string }[] = []
    for (const bar of bars) {
      const start = parseDay(bar.startIso)
      const end = parseDay(bar.endIso)
      if (start === null || end === null || !isMonthBar(start, end)) continue
      if (start <= sunday && end >= monday) {
        touching.push({ id: bar.id, title: bar.title, start, end })
      }
    }
    touching.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    const laneEnd: string[] = []
    for (const bar of touching) {
      const clipStart = bar.start > monday ? bar.start : monday
      let lane = laneEnd.findIndex((storedEnd) => storedEnd < clipStart)
      if (lane < 0) {
        lane = laneEnd.length
        laneEnd.push(bar.end)
      } else {
        laneEnd[lane] = bar.end
      }
      const clipEnd = bar.end < sunday ? bar.end : sunday
      segments.push({
        rowId: bar.id,
        title: bar.title,
        weekStart: monday,
        lane,
        columnStart: mondayDow(clipStart) + 1,
        columnEnd: mondayDow(clipEnd) + 2,
        squareLeft: bar.start < monday,
        squareRight: bar.end > sunday,
      })
    }
  }
  return segments
}

/** Rows bucketed by their `YYYY-MM-DD` day, for the grid's per-day lookup. No
 *  `dateDef` (the collection has no date property) buckets nothing — every cell
 *  reads empty, matching the DC's `empty` state (`recs = []`). When `endDef` is
 *  present, a row `isMonthBar` is omitted: it draws as a bar, not a chip, and
 *  does not add to `moreCount`. Absent, every dated row buckets as before. */
function bucketByDate(
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined,
  endDef?: PropertyDef
): Map<string, CollectionRow[]> {
  const byDate = new Map<string, CollectionRow[]>()
  if (!dateDef) return byDate
  for (const row of rows) {
    const iso = rowDateIso(row, dateDef)
    if (!iso) continue
    if (endDef && isMonthBar(iso, rowDateIso(row, endDef))) continue
    const bucket = byDate.get(iso)
    if (bucket) bucket.push(row)
    else byDate.set(iso, [row])
  }
  return byDate
}

/** All of a day's dated rows, not capped to 3 — the mobile month's focused-day list
 *  (DC's `agDays` for `listDays=[focus]`) reads every row, where a grid cell caps at 3. */
export function dayItems(
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined,
  iso: string
): CollectionRow[] {
  if (!dateDef) return []
  return rows.filter((row) => rowDateIso(row, dateDef) === iso)
}

/**
 * The focused month's grid: `gStart`/`nWeeks` from the DC —
 *   `gStart = monday(m1)`, `nWeeks = Math.ceil((dow(m1) + mDays) / 7)`
 * — so the grid always starts on a Monday and covers whole weeks either side of the
 * month. `focusIso`/`todayIso` need only name a day within their month; only their
 * year/month are read for the grid, matching the DC's own `fm`/`today` use.
 * `endDef`, when the caller resolved a second date via `pickGanttDefs`, drops
 * range rows out of the day chips. Omit it and the buckets stay as they are.
 */
export function buildMonthGrid(
  focusIso: string,
  todayIso: string,
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined,
  endDef?: PropertyDef
): MonthGrid {
  const { year, month0 } = parseYearMonth(focusIso)
  const m1Iso = isoFromYearMonth(year, month0, 1)
  const mDays = daysInMonth(year, month0)
  const dowM1 = mondayDow(m1Iso)
  const gStartIso = addDays(m1Iso, -dowM1)
  const nWeeks = Math.ceil((dowM1 + mDays) / 7)
  const byDate = bucketByDate(rows, dateDef, endDef)
  const monthKey = m1Iso.slice(0, 7)

  const weeks: MonthWeek[] = Array.from({ length: nWeeks }, (_, w) => ({
    days: Array.from({ length: 7 }, (_, i): MonthDayCell => {
      const iso = addDays(gStartIso, w * 7 + i)
      const items = byDate.get(iso) ?? []
      return {
        iso,
        dayOfMonth: Number(iso.slice(8, 10)),
        inMonth: iso.slice(0, 7) === monthKey,
        isToday: iso === todayIso,
        items: items.slice(0, 3),
        moreCount: Math.max(0, items.length - 3),
      }
    }),
  }))

  return { periodLabel: `${MONTHS[month0]} ${year}`, weeks }
}

/**
 * `prev`/`next` on the month span (the DC's `step(d)` month branch): whole calendar
 * months, pinned to the 1st — the DC never keeps `focus`'s day-of-month once it
 * steps, so a month grid's shape never depends on which day it started from.
 */
export function stepMonth(focusIso: string, direction: -1 | 1): string {
  const { year, month0 } = parseYearMonth(focusIso)
  return isoFromYearMonth(year, month0 + direction, 1)
}

/** `goToday` on the month span: the DC sets `pick` to `today` exactly (not day 1) —
 *  harmless for the grid, since only `today`'s year/month are read. */
export function goToday(todayIso: string): string {
  return todayIso
}

/** The date value a drop onto `dayIso` should write: a date-only value becomes
 *  `dayIso` outright; a datetime value keeps everything from its `T` onward
 *  (time, seconds, zone) and only its date part moves. String-sliced, never
 *  `Date`-parsed, so a drop can't shear across a month/year/leap-day edge. A
 *  non-string or missing value has no time part to keep, so it becomes `dayIso`. */
export function dateForDrop(value: unknown, dayIso: string): string {
  if (typeof value !== 'string') return dayIso
  const tIndex = value.indexOf('T')
  if (tIndex === -1) return dayIso
  return dayIso + value.slice(tIndex)
}

/** The start and end a bar drop onto `dropDay` should write. The drop day
 *  becomes the new start; the end moves by the same day count, and each field
 *  keeps its `T…` suffix through `dateForDrop`. A row that is not a bar, or a
 *  drop on the row's own start day, writes nothing. Days are the leading
 *  `slice(0, 10)`, the same bucket `rowDateIso` uses. */
export function rangeForDrop(
  startValue: unknown,
  endValue: unknown,
  dropDay: string,
): { start: string; end: string } | null {
  const startDay = typeof startValue === 'string' && startValue ? startValue.slice(0, 10) : null
  const endDay = typeof endValue === 'string' && endValue ? endValue.slice(0, 10) : null
  if (!isMonthBar(startDay, endDay) || startDay === null || endDay === null) return null
  if (dropDay === startDay) return null
  const delta = epochDay(dropDay) - epochDay(startDay)
  return {
    start: dateForDrop(startValue, dropDay),
    end: dateForDrop(endValue, addDays(endDay, delta)),
  }
}

/** `dow` — Monday-first weekday index, for the focused-day list's own head label
 *  (`DW[dow(focus)]`), computed independent of any grid cell. */
export function weekdayIndex(iso: string): number {
  return mondayDow(iso)
}

/** `MS` — the DC's 3-letter month form (`MON.map(m => m.slice(0,3))`), for the
 *  focused-day list head's `${DW} ${MS}`. */
export function monthAbbr(iso: string): string {
  const { month0 } = parseYearMonth(iso)
  return MONTHS[month0].slice(0, 3)
}
