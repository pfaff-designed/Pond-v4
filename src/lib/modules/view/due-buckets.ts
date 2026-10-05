/**
 * The list view's groups (`Pond 06.21` 6v, "grouped by due"): rows bucketed by when
 * they are due, read at render time from the same rows every other view draws.
 *
 * 6v draws four buckets — `today`, `this week`, `next week`, `done`. A record that
 * fits none of them still has to be somewhere, so three more stand in for it:
 * `earlier` (open and past), `later` (open, beyond next week) and `no date`. They
 * appear only when they hold rows, and only the four are ever drawn on a tidy list.
 *
 * "Done" is a state, not a date: a row whose status/select reads as the option
 * labelled `done`. `done` is checked first, so a finished task never sits under
 * `today` or `earlier`.
 *
 * Weeks run Monday to Sunday, matching the board's weekday words.
 */

import {
  coerceValue,
  optionForValue,
  type PropertyDef,
  type PropertySchema,
} from '@/lib/properties/schema'
import { epochDay, pickDateDef, pickGroupDef, type CollectionRow } from './apply'

export const DUE_BUCKETS = [
  'earlier',
  'today',
  'this week',
  'next week',
  'later',
  'no date',
  'done',
] as const
export type DueBucketId = (typeof DUE_BUCKETS)[number]

export interface DueBucket {
  id: DueBucketId
  rows: CollectionRow[]
}

/** The status/select whose `done` option a tick writes, and where an untick returns to. */
export interface DoneState {
  def: PropertyDef
  doneId: string
  /** The first option that is not `done` — where an unticked record goes back to. */
  openId: string
}

const isDoneLabel = (label: string) => label.trim().toLowerCase() === 'done'

/**
 * The tick's rule. The record's own status/select (the same property the board lanes
 * on) carries done-ness: ticking writes its option labelled `done`, unticking writes
 * the first option that is not. A schema with no such option has nothing for a tick
 * to write, so it returns null and the list draws its checkboxes inert.
 */
export function pickDoneState(schema: PropertySchema): DoneState | null {
  const def = pickGroupDef(schema, undefined)
  const options = def?.options ?? []
  const done = options.find((o) => isDoneLabel(o.label))
  const open = options.find((o) => !isDoneLabel(o.label))
  if (!def || !done || !open) return null
  return { def, doneId: done.id, openId: open.id }
}

/** Whether a row sits in the `done` option. */
export function isRowDone(row: CollectionRow, state: DoneState | null): boolean {
  if (!state) return false
  const option = optionForValue(state.def, coerceValue(state.def, row.values[state.def.id]))
  return !!option && isDoneLabel(option.label)
}

const localEpochDay = (now: Date) =>
  Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)

/**
 * Bucket `rows` by the date property (`groupBy` if it names one, else the first).
 * Null when the collection has no date property to group by. Open buckets keep the
 * view's own row order within a day and run earliest-first; `done` keeps view order.
 */
export function groupRowsByDue(
  rows: readonly CollectionRow[],
  schema: PropertySchema,
  now: Date,
  groupBy?: string
): { dateDef: PropertyDef; done: DoneState | null; buckets: DueBucket[] } | null {
  const dateDef = pickDateDef(schema, groupBy)
  if (!dateDef) return null
  const done = pickDoneState(schema)

  const today = localEpochDay(now)
  // Monday on or before today. `getDay()` is 0 for Sunday, so Sunday is six days in.
  const weekStart = today - ((now.getDay() + 6) % 7)

  const buckets = new Map<DueBucketId, { row: CollectionRow; day: number }[]>()
  for (const row of rows) {
    const value = coerceValue(dateDef, row.values[dateDef.id])
    const iso = typeof value === 'string' && value ? value.slice(0, 10) : null
    const day = iso ? epochDay(iso) : 0
    const id: DueBucketId = isRowDone(row, done)
      ? 'done'
      : !iso
        ? 'no date'
        : day < today
          ? 'earlier'
          : day === today
            ? 'today'
            : day <= weekStart + 6
              ? 'this week'
              : day <= weekStart + 13
                ? 'next week'
                : 'later'
    const list = buckets.get(id)
    if (list) list.push({ row, day })
    else buckets.set(id, [{ row, day }])
  }

  return {
    dateDef,
    done,
    buckets: DUE_BUCKETS.flatMap((id) => {
      const entries = buckets.get(id)
      if (!entries) return []
      // Array#sort is stable: rows due the same day keep the view's order.
      if (id !== 'done' && id !== 'no date') entries.sort((a, b) => a.day - b.day)
      return [{ id, rows: entries.map((e) => e.row) }]
    }),
  }
}
