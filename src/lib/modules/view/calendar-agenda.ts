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
import {
  monthAbbr,
  nextProjectedIso,
  repeatPhrase,
  rowDateIso,
  weekdayIndex,
} from './calendar-month'

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
 * Days from the Monday of `agendaRange(focusIso)` through the inclusive last
 * day `addDays(agendaRange(focusIso).end, Math.max(0, extensions) * 14)`.
 * `extensions` 0 is that fourteen-day window. A day with no rows is left out
 * unless it is `todayIso`. A row before the Monday or after the last day never
 * lands in a group. A value with a `T` stays timed even outside 08:00–19:00,
 * because `splitDayRows` slices `HH:MM` and does not clip to the day grid. No
 * date property → no groups, including when today falls inside.
 */
export function buildAgenda(
  focusIso: string,
  todayIso: string,
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined,
  extensions = 0,
  repeatDef?: PropertyDef
): AgendaGroup[] {
  if (!dateDef) return []

  const range = agendaRange(focusIso)
  const last = addDays(range.end, Math.max(0, extensions) * 14)
  const groups: AgendaGroup[] = []

  for (let iso = range.start; iso <= last; iso = addDays(iso, 1)) {
    const dayRows = splitDayRows(rows, dateDef, iso, repeatDef)
    const hasRows = dayRows.untimed.length > 0 || dayRows.timed.length > 0
    if (!hasRows && iso !== todayIso) continue
    groups.push({ iso, rows: dayRows })
  }

  return groups
}

/**
 * How many 14-day slices include the next dated row after the current end.
 * `end` is `addDays(agendaRange(focusIso).end, Math.max(0, extensions) * 14)`.
 * A missing date property, or no date part strictly after `end`, returns that
 * count. Otherwise the smallest `n` greater than the count such that the
 * earliest later date part is on or before
 * `addDays(agendaRange(focusIso).end, n * 14)`. One call stops at that next
 * row; a later row waits for another reach.
 */
export function agendaExtensionsAfterReach(
  focusIso: string,
  rows: readonly CollectionRow[],
  dateDef: PropertyDef | undefined,
  extensions: number,
  repeatDef?: PropertyDef
): number {
  const count = Math.max(0, extensions)
  if (!dateDef) return count

  const windowEnd = agendaRange(focusIso).end
  const end = addDays(windowEnd, count * 14)

  let earliest: string | null = null
  const consider = (current: string | null, iso: string | null): string | null => {
    if (iso == null || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso <= end) return current
    if (current == null || iso < current) return iso
    return current
  }
  for (const item of rows) {
    const start = rowDateIso(item, dateDef)
    earliest = consider(earliest, start)
    if (repeatDef && start) {
      earliest = consider(earliest, nextProjectedIso(start, repeatPhrase(item, repeatDef), end))
    }
  }
  if (earliest == null) return count

  let n = count
  while (earliest > addDays(windowEnd, n * 14)) n += 1
  return n
}
