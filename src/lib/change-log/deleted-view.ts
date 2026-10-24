/**
 * The change log's `deleted` view (KAN-97; board `Pond 06.15 Change log`,
 * frame `s6o6 deletions`).
 *
 * One card per `delete` record: title, actor/time, where it was, what it
 * held, and whether it's still restorable, already restored, or emptied.
 * `goneIds` names page ids the purge job (out of scope for this ticket) has
 * hard-deleted — once a trashed row is invisible even to its own owner's
 * SELECT (0027 part 2), that's the only way left to tell "still in trash"
 * from "emptied".
 *
 * Pure — derived from records and ids the caller already has. No Supabase,
 * no React, no formatting decisions beyond a short human label.
 */

import { daysBetween } from './log-page'
import { readTrashSnapshot } from './summary'
import type { ChangeLogRecord } from './types'

export const TRASH_RETENTION_DAYS = 30

/** `null` for an unreadable ISO date string (missing or unparseable) — the
 *  one impossible state (AGENTS.md "crash early"): throws in development,
 *  logs and returns `null` in production. `context` names the caller in the
 *  thrown/logged message. The one home `purgeDay` and `whenLabel` both read,
 *  so no caller ever feeds an Invalid Date into `.toISOString()` (KAN-551)
 *  or a date formatter that silently renders `"Invalid Date"`/`NaN`. */
function readDate(iso: string, context: string): Date | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const message = `${context}: unreadable date (${JSON.stringify(iso)})`
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(message)
    }
    console.error(message)
    return null
  }
  return d
}

/** The local calendar day a page trashed at `createdAt` goes — `setDate` in
 *  local time, never ms addition, so a page deleted near a DST change still
 *  reads the right day (KAN-500). The one home both `purgeDate` below and
 *  `daysUntilGone` (`trash-view.ts`) read. */
export function purgeDay(createdAt: string): Date | null {
  const d = readDate(createdAt, 'purgeDay')
  if (d === null) return null
  d.setDate(d.getDate() + TRASH_RETENTION_DAYS)
  return d
}

/** `12 aug` — s6o6's own register: day first, lowercase short month, no year. */
const shortDate = (d: Date): string =>
  `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' }).toLowerCase()}`

const clock = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** `yesterday 18:40` within a day either side of `now`, else the bare
 *  `shortDate` — `''` for an unreadable `createdAt` (KAN-551), same
 *  dev-throw/production-log fallback as `purgeDay`, via `readDate`. */
const whenLabel = (iso: string, now: Date): string => {
  const d = readDate(iso, 'whenLabel')
  if (d === null) return ''
  const diffDays = daysBetween(now, iso)
  if (diffDays === 0) return `today ${clock(d)}`
  if (diffDays === 1) return `yesterday ${clock(d)}`
  return shortDate(d)
}

const pluralCount = (n: number, singular: string, plural: string = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`

/** `''` for an unreadable `createdAt` — `purgeDay` already logged/threw;
 *  the card still renders, just with no restorable/emptied date. */
const purgeDate = (createdAt: string): string => {
  const day = purgeDay(createdAt)
  return day === null ? '' : shortDate(day)
}

/** `restore_page` (0027) stamps this DB-side-only onto the `restore` record's
 *  `after` when the original parent was trashed or gone — not part of the
 *  `TrashSnapshot` TS shape (`readTrashSnapshot` ignores it), just this one
 *  flag the deleted view needs to say so. */
export const fellBackToPondRoot = (after: unknown): boolean =>
  typeof after === 'object' &&
  after !== null &&
  (after as { parentFallback?: unknown }).parentFallback === true

export type DeletedCardStatus =
  | { kind: 'in_trash'; restorableUntil: string }
  | { kind: 'emptied'; emptiedOn: string }
  | { kind: 'restored'; parentFallback: boolean }

export interface DeletedCard {
  /** The `delete` record this card renders — its id is what `restorePage` takes. */
  record: ChangeLogRecord
  title: string
  /** `you · yesterday 18:40` / `you · 12 aug`. */
  actorTime: string
  /** `creativity › kitchen renovation`, or the pond root's own label (passed
   *  in by the caller, who reads it the same way the rail/breadcrumb do) for
   *  a page that was already at the pond root when trashed. */
  wasIn: string
  /** `4 blocks, 1 nested page`. */
  held: string
  status: DeletedCardStatus
  /** Offer restore? Only while `status.kind === 'in_trash'`. */
  restoreOffered: boolean
}

/**
 * Records sharing a `targetPageId`, oldest first — a `delete` is always
 * immediately followed (if at all) by the `restore` that answers it, since
 * `trash_page`/`restore_page` each refuse a page already in the state the
 * other would produce. So the next entry after a `delete`, if any, is always
 * that `restore`.
 */
export const groupByTarget = (records: ChangeLogRecord[]): Map<string, ChangeLogRecord[]> => {
  const byTarget = new Map<string, ChangeLogRecord[]>()
  for (const record of records) {
    if (record.targetPageId === null) continue
    const list = byTarget.get(record.targetPageId)
    if (list) list.push(record)
    else byTarget.set(record.targetPageId, [record])
  }
  for (const list of byTarget.values()) {
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  }
  return byTarget
}

/**
 * One card per `delete` record, in the order `records` gave them. A record
 * with no parseable `TrashSnapshot` in `before` renders no card — there is
 * nothing true to say about it.
 */
export function buildDeletedCards(
  records: ChangeLogRecord[],
  now: Date,
  goneIds: ReadonlySet<string>,
  /** The pond root's own label (the rail/breadcrumb's "life") — read by the
   *  caller, never guessed here, since this module has no page tree to read
   *  it from itself. */
  rootLabel: string
): DeletedCard[] {
  const byTarget = groupByTarget(records)

  const cards: DeletedCard[] = []
  for (const record of records) {
    if (record.action !== 'delete') continue
    const snapshot = readTrashSnapshot(record.before)
    if (snapshot === null) continue

    const sameTarget = record.targetPageId === null ? [] : byTarget.get(record.targetPageId) ?? []
    const nextForTarget = sameTarget[sameTarget.findIndex((r) => r.id === record.id) + 1]
    const restored = nextForTarget !== undefined && nextForTarget.action === 'restore'
    const gone = record.targetPageId === null || goneIds.has(record.targetPageId)

    const status: DeletedCardStatus = restored
      ? { kind: 'restored', parentFallback: fellBackToPondRoot(nextForTarget.after) }
      : gone
        ? { kind: 'emptied', emptiedOn: purgeDate(record.createdAt) }
        : { kind: 'in_trash', restorableUntil: purgeDate(record.createdAt) }

    cards.push({
      record,
      title: snapshot.title,
      actorTime: `${record.actor} · ${whenLabel(record.createdAt, now)}`,
      wasIn: snapshot.parentPath.length > 0 ? snapshot.parentPath.join(' › ') : rootLabel,
      held: `${pluralCount(snapshot.blockCount, 'block')}, ${pluralCount(snapshot.nestedPageCount, 'nested page')}`,
      status,
      restoreOffered: status.kind === 'in_trash',
    })
  }
  return cards
}
