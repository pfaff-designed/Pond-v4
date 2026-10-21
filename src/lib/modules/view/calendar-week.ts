/**
 * The calendar view's week span — the pure range math `PondCalendar.dc.html`
 * does for `span === 'week'` (`wkLabel`, Monday–Sunday). Dates step through
 * `addDays` and the weekday comes from `weekdayIndex`. The label is sliced off
 * the `YYYY-MM-DD` string, never `Date`-parsed, so a week can't shear across a
 * zone.
 */
import { addDays } from './apply'
import { monthAbbr, weekdayIndex } from './calendar-month'

/** En dash, the DC's `wkLabel` separator (U+2013). */
const EN_DASH = '\u2013'

/** Monday–Sunday containing `iso`: start is that Monday, end is six days later. */
export interface WeekRange {
  start: string
  end: string
}

/** The open week's Monday and Sunday. `weekdayIndex` is Monday-first. */
export function weekRange(iso: string): WeekRange {
  const start = addDays(iso, -weekdayIndex(iso))
  return { start, end: addDays(start, 6) }
}

/** `prev`/`next` on the week span: seven UTC days, so a month end rolls over. */
export function stepWeek(iso: string, direction: -1 | 1): string {
  return addDays(iso, direction * 7)
}

/**
 * Week-span period label, the DC's `wkLabel`. The same UTC month names the
 * month once (`19 – 25 oct 2026`). A different month names both, and only the
 * end year (`26 oct – 1 nov 2026`, `28 dec – 3 jan 2027`).
 */
export function weekPeriodLabel(startIso: string, endIso: string): string {
  const startDay = Number(startIso.slice(8, 10))
  const endDay = Number(endIso.slice(8, 10))
  const endYear = endIso.slice(0, 4)
  const endMonth = monthAbbr(endIso)
  if (startIso.slice(0, 7) === endIso.slice(0, 7)) {
    return `${startDay} ${EN_DASH} ${endDay} ${endMonth} ${endYear}`
  }
  return `${startDay} ${monthAbbr(startIso)} ${EN_DASH} ${endDay} ${endMonth} ${endYear}`
}
