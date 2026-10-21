/**
 * The calendar view's day span — the pure time-grid math `PondCalendar.dc.html`
 * does for `span === 'day'`, kept apart from the React renderer the same way
 * `calendar-month.ts` keeps the month grid. Dates step through `addDays` and the
 * weekday comes from `weekdayIndex` (the DC's `mondayDow`). A clock time is sliced
 * `HH:MM` off the date value's `T` part and turned into decimal hours by splitting
 * that string — never `Date`-parsed, so a time can't shear across a zone.
 */
import { coerceValue, type PropertyDef } from '@/lib/properties/schema'
import { addDays, type CollectionRow } from './apply'
import { monthAbbr, rowDateIso, weekdayIndex } from './calendar-month'

/** The DC's `DW` — Monday-first, lowercase, the day span's period label. */
const DW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * Time grid from the DC: `H0 = 8`, `H1 = 19`. Hours run 8 inclusive through 19
 * exclusive, so the labels are `08:00` … `18:00` (`Array.from({ length: H1 - H0 })`).
 */
export const DAY_HOUR_START = 8
export const DAY_HOUR_END = 19

/** `HH = mob ? 48 : 44` — the hour row, in px, as the board writes it. */
export const DAY_ROW_HEIGHT = { desktop: 44, mobile: 48 } as const

/** `gut = mob ? 40 : 52` — the hour-label gutter, in px. */
export const DAY_GUTTER = { desktop: 52, mobile: 40 } as const

/**
 * DC missing-end rule: `f = o.f ? hm(o.f) : s + .5`. A Pond date has no end
 * field, so every timed row is this long.
 */
export const DAY_DEFAULT_DURATION_HOURS = 0.5

export type DayMetricSize = keyof typeof DAY_ROW_HEIGHT

/** One timed row on the open day: the sliced `HH:MM` and the span it occupies. */
export interface DayTimedRow {
  row: CollectionRow
  timeLabel: string
  startHours: number
  endHours: number
}

/** Untimed rows first (date value has no `T`), then timed rows ordered by `HH:MM`. */
export interface DayRows {
  untimed: CollectionRow[]
  timed: DayTimedRow[]
}

/** One column of the phone week strip: Monday-first, one date per row. */
export interface StripDay {
  iso: string
  letter: string
  day: number
  isFocus: boolean
  hasDot: boolean
}

const HM = /^(\d{2}):(\d{2})/

/** `HH:MM` sliced from the `T` part. No `T`, or no clock there, is untimed. */
function slicedHm(value: string): string | null {
  const tIndex = value.indexOf('T')
  if (tIndex === -1) return null
  const match = HM.exec(value.slice(tIndex + 1))
  if (!match) return null
  return `${match[1]}:${match[2]}`
}

/** Decimal hours from a sliced `HH:MM` (`h + m/60`, the DC's `hm`). Never `Date`. */
function hoursFromHm(hm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hm)
  if (!match) return Number.NaN
  return Number(match[1]) + Number(match[2]) / 60
}

/**
 * Day-span period label, the DC's `` `${DW[dow]} ${dm} ${year}` ``.
 * `dm` is the unpadded UTC day plus the 3-letter month (`21 oct`).
 */
export function dayPeriodLabel(iso: string): string {
  const day = Number(iso.slice(8, 10))
  const year = iso.slice(0, 4)
  return `${DW[weekdayIndex(iso)]} ${day} ${monthAbbr(iso)} ${year}`
}

/** `prev`/`next` on the day span: one UTC day, so a month end rolls over. */
export function stepDay(iso: string, direction: -1 | 1): string {
  return addDays(iso, direction)
}

/**
 * The open day's week on a phone: seven Monday-first days from
 * `addDays(focusIso, -weekdayIndex(focusIso))`. `letter` is the first character
 * of `mon`…`sun`. `hasDot` is true when some row's `rowDateIso` equals that day
 * — one date per row, the same bucket as the month span. No date property
 * dots nothing.
 */
export function stripWeek(
  focusIso: string,
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined
): StripDay[] {
  const startIso = addDays(focusIso, -weekdayIndex(focusIso))
  return Array.from({ length: 7 }, (_, offset): StripDay => {
    const iso = addDays(startIso, offset)
    const hasDot =
      dateDef !== undefined && rows.some((row) => rowDateIso(row, dateDef) === iso)
    return {
      iso,
      letter: DW[offset].slice(0, 1),
      day: Number(iso.slice(8, 10)),
      isFocus: iso === focusIso,
      hasDot,
    }
  })
}

/** The eleven hour labels, `08:00` through `18:00`. */
export function dayHourLabels(): string[] {
  const labels: string[] = []
  for (let hour = DAY_HOUR_START; hour < DAY_HOUR_END; hour += 1) {
    labels.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return labels
}

/**
 * The open day's rows. A value with no `T` is untimed and stays in encounter
 * order. A value with a sliced `HH:MM` is timed, ordered by that clock, and its
 * end is the start plus {@link DAY_DEFAULT_DURATION_HOURS}. Rows on any other
 * day are left out. No date property → nothing, same as the month span.
 */
export function splitDayRows(
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined,
  iso: string
): DayRows {
  if (!dateDef) return { untimed: [], timed: [] }

  const untimed: CollectionRow[] = []
  const timed: DayTimedRow[] = []

  for (const row of rows) {
    if (rowDateIso(row, dateDef) !== iso) continue
    const value = coerceValue(dateDef, row.values[dateDef.id])
    const timeLabel = typeof value === 'string' ? slicedHm(value) : null
    if (!timeLabel) {
      untimed.push(row)
      continue
    }
    const startHours = hoursFromHm(timeLabel)
    timed.push({
      row,
      timeLabel,
      startHours,
      endHours: startHours + DAY_DEFAULT_DURATION_HOURS,
    })
  }

  timed.sort((a, b) => (a.timeLabel < b.timeLabel ? -1 : a.timeLabel > b.timeLabel ? 1 : 0))
  return { untimed, timed }
}

/**
 * Now-line top, the DC's `(nowH - H0) * HH`, or `null` when the line is not
 * drawn: another day, or `now` outside `08:00`–`19:00` inclusive
 * (`nowH >= H0 && nowH <= H1`).
 */
export function nowLineTop(
  dayIso: string,
  todayIso: string,
  nowHm: string,
  size: DayMetricSize
): number | null {
  if (dayIso !== todayIso) return null
  const nowH = hoursFromHm(nowHm)
  if (!Number.isFinite(nowH)) return null
  if (nowH < DAY_HOUR_START || nowH > DAY_HOUR_END) return null
  return (nowH - DAY_HOUR_START) * DAY_ROW_HEIGHT[size]
}
