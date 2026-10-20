/**
 * The calendar view's agenda span — the pure range math `PondCalendar.dc.html`
 * does for `span === 'agenda'` (Monday plus thirteen days, `from ${dm(vs)}`).
 * Dates step through `addDays` and the weekday comes from `weekdayIndex`. The
 * label is sliced off the `YYYY-MM-DD` string, never `Date`-parsed, so a window
 * can't shear across a zone. A day's rows are `splitDayRows`: untimed in
 * encounter order, then timed by the sliced `HH:MM`.
 */
import type { PropertyDef } from '@/lib/properties/schema'
import { addDays, type CollectionRow } from './apply'
import { splitDayRows, type DayRows } from './calendar-day'
import { monthAbbr, weekdayIndex } from './calendar-month'

/** Monday through the thirteenth day after it: the board's 14-day agenda window. */
export interface AgendaRange {
  start: string
  end: string
}

/** One day in the window. `rows` is `splitDayRows` for that day. */
export interface AgendaGroup {
  iso: string
  rows: DayRows
}

/**
 * The open agenda window. Start is the Monday of `iso`'s week
 * (`addDays(iso, -weekdayIndex(iso))`); end is thirteen days later, so the
 * window is fourteen days inclusive.
 */
export function agendaRange(iso: string): AgendaRange {
  const start = addDays(iso, -weekdayIndex(iso))
  return { start, end: addDays(start, 13) }
}

/** `prev`/`next` on the agenda span: fourteen UTC days, not snapped to Monday. */
export function stepAgenda(iso: string, direction: -1 | 1): string {
  return addDays(iso, direction * 14)
}

/**
 * Agenda period label, the DC's `` `from ${dm(vs)}` ``. The day is the unpadded
 * UTC day (`from 19 oct`, `from 2 nov`). No year.
 */
export function agendaPeriodLabel(startIso: string): string {
  const day = Number(startIso.slice(8, 10))
  return `from ${day} ${monthAbbr(startIso)}`
}

/**
 * The fourteen days from `agendaRange(focusIso)`, as groups. A day with no rows
 * is left out unless it is `todayIso`. A row before the Monday or after the end
 * day never lands in a group. A value with a `T` stays timed even outside
 * 08:00–19:00, because `splitDayRows` slices `HH:MM` and does not clip to the
 * day grid. No date property → no groups, including when today falls inside.
 */
export function buildAgenda(
  focusIso: string,
  todayIso: string,
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined
): AgendaGroup[] {
  if (!dateDef) return []

  const { start } = agendaRange(focusIso)
  const groups: AgendaGroup[] = []

  for (let offset = 0; offset < 14; offset += 1) {
    const iso = addDays(start, offset)
    const dayRows = splitDayRows(rows, dateDef, iso)
    const hasRows = dayRows.untimed.length > 0 || dayRows.timed.length > 0
    if (!hasRows && iso !== todayIso) continue
    groups.push({ iso, rows: dayRows })
  }

  return groups
}
