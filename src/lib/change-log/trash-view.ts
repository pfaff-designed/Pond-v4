/**
 * The trash page (KAN-451): its rail/URL id — same pattern as
 * {@link CHANGE_LOG_NODE_ID} in `log-page.ts`, a reserved virtual node, no
 * `pages` row, no migration — and its view model.
 *
 * One row per subtree still in trash: a `delete` record whose target hasn't
 * since been restored or purged. Shares `deleted-view.ts`'s own
 * `groupByTarget` pairing so "still in trash" is derived identically on both
 * surfaces, never re-decided here.
 *
 * Pure — derived from records and ids the caller already has. No Supabase,
 * no React.
 */

import { CHANGE_LOG_NODE_ID, daysBetween, dayHeaderLabel } from './log-page'
import { groupByTarget, TRASH_RETENTION_MS } from './deleted-view'
import { readTrashSnapshot } from './summary'
import type { ChangeLogRecord } from './types'

/** The rail/URL id for the trash page. Never a real page id. */
export const TRASH_NODE_ID = '__trash__'

/** True for either reserved virtual node — the change log or trash — neither
 *  of which has a `pages` row behind it, so a page-id-keyed query (`getPage`,
 *  a cross-page target fetch) must never run against it. Lives here, not
 *  `log-page.ts`, because this module already imports from that one; the
 *  reverse import would cycle. */
export function isVirtualNodeId(id: string): boolean {
  return id === CHANGE_LOG_NODE_ID || id === TRASH_NODE_ID
}

export interface TrashRow {
  /** The `delete` record this row renders — its id is what `restorePage` takes. */
  record: ChangeLogRecord
  page: string
  /** The former parent's CURRENT title when it's still live, else the
   *  frozen name it had at delete time, else `rootLabel` for a page that
   *  was already at the pond root. */
  wasIn: string
  deletedAt: string
  deletedBy: string
  /** `today` / `in 1 day` / `in 12 days` — always rendered in ink, never the
   *  burnt-orange "one dated thing" treatment, even this close to going
   *  (the spec's own override of the deleted view's own `restorableUntil`,
   *  which does highlight the single soonest one). */
  goes: string
}

const dayWord = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`

/** Calendar days from `now` until `createdAt + TRASH_RETENTION_DAYS` — the
 *  negation of `daysBetween`, which measures the other direction (elapsed
 *  days since `iso`, as of `now`). Can go negative: the purge (KAN-452) isn't
 *  built, so a trashed page can sit past its own retention window. */
const daysUntilGone = (createdAt: string, now: Date): number => {
  const purgeMoment = new Date(Date.parse(createdAt) + TRASH_RETENTION_MS).toISOString()
  return -daysBetween(now, purgeMoment)
}

/** `daysUntilGone` clamped at the reader: zero or overdue both read `today`,
 *  never a negative day count. */
const goesLabel = (daysLeft: number): string => (daysLeft <= 0 ? 'today' : `in ${dayWord(daysLeft)}`)

/**
 * One row per `delete` record still in trash — the subtree's root only, as
 * `delete`/`restore` already pair a whole subtree under one record; nested
 * pages travel with it and are never listed separately. Records already
 * restored or purged are left out, matching `buildDeletedCards`'s own
 * in_trash/restored/emptied split rather than re-deriving it.
 */
export function buildTrashRows(
  records: ChangeLogRecord[],
  /** Live pages only (the same `[...pagesKey(pondId), 'full']` lookup the
   *  change log page already builds) — read for a former parent's CURRENT
   *  title, since a parent that stayed in the pond could have been renamed
   *  since its child was trashed. */
  pageTitleById: Map<string, string>,
  goneIds: ReadonlySet<string>,
  rootLabel: string,
  now: Date
): TrashRow[] {
  const byTarget = groupByTarget(records)

  const rows: TrashRow[] = []
  for (const record of records) {
    if (record.action !== 'delete') continue
    const snapshot = readTrashSnapshot(record.before)
    if (snapshot === null) continue

    const sameTarget = record.targetPageId === null ? [] : byTarget.get(record.targetPageId) ?? []
    const nextForTarget = sameTarget[sameTarget.findIndex((r) => r.id === record.id) + 1]
    const restored = nextForTarget !== undefined && nextForTarget.action === 'restore'
    const gone = record.targetPageId === null || goneIds.has(record.targetPageId)
    if (restored || gone) continue

    const wasIn =
      snapshot.parentId === null
        ? rootLabel
        : pageTitleById.get(snapshot.parentId) ??
          snapshot.parentPath[snapshot.parentPath.length - 1] ??
          rootLabel

    rows.push({
      record,
      page: snapshot.title,
      wasIn,
      deletedAt: dayHeaderLabel(record.createdAt, now),
      deletedBy: record.actor,
      goes: goesLabel(daysUntilGone(record.createdAt, now)),
    })
  }
  return rows
}
