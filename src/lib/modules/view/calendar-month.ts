/**
 * The calendar view's month span — the pure grid math `PondCalendar.dc.html`'s
 * `renderVals()` does for `span === 'month'` (#262 1/3), kept apart from the React
 * renderer in `collection-calendar.tsx` so it's directly unit-testable (mirrors
 * `gantt-shared.ts`'s split of layout from drawing). Dates are UTC throughout —
 * `epochDay`/`addDays` from `apply.ts` for day arithmetic, `Date.UTC` for month
 * arithmetic — never local time, so the grid never shears across a timezone or a
 * DST boundary.
 */
import { coerceValue, type PropertyDef } from '@/lib/properties/schema'
import { addDays, type CollectionRow } from './apply'

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
 *  undated row, which the month span never shows. */
function rowDateIso(row: CollectionRow, dateDef: PropertyDef): string | null {
  const value = coerceValue(dateDef, row.values[dateDef.id])
  return typeof value === 'string' && value ? value.slice(0, 10) : null
}

/** Rows bucketed by their `YYYY-MM-DD` day, for the grid's per-day lookup. No
 *  `dateDef` (the collection has no date property) buckets nothing — every cell
 *  reads empty, matching the DC's `empty` state (`recs = []`). */
function bucketByDate(
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined
): Map<string, CollectionRow[]> {
  const byDate = new Map<string, CollectionRow[]>()
  if (!dateDef) return byDate
  for (const row of rows) {
    const iso = rowDateIso(row, dateDef)
    if (!iso) continue
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
 */
export function buildMonthGrid(
  focusIso: string,
  todayIso: string,
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined
): MonthGrid {
  const { year, month0 } = parseYearMonth(focusIso)
  const m1Iso = isoFromYearMonth(year, month0, 1)
  const mDays = daysInMonth(year, month0)
  const dowM1 = mondayDow(m1Iso)
  const gStartIso = addDays(m1Iso, -dowM1)
  const nWeeks = Math.ceil((dowM1 + mDays) / 7)
  const byDate = bucketByDate(rows, dateDef)
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
