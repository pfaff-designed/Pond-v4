/**
 * The change log page's view model (KAN-94; board `Pond 06.15 Change log`,
 * frame `s6o1`).
 *
 * The page is a reserved virtual node — no row, no migration, same shape as
 * `DATABASES_PLACEHOLDER_ROW` in `Rail.tsx` — identified by {@link CHANGE_LOG_NODE_ID}
 * wherever the rail or the URL needs to name it.
 *
 * Pure — the rows are derived from records the caller already has (`listRecords`)
 * and a page-title lookup it already resolved. No Supabase, no React.
 */

import { describeChange, formatClockTime } from './page-changes'
import { WAITING_STATUSES } from './status'
import type { ChangeLogRecord, ChangeLogStatus } from './types'

/** The rail/URL id for the change log page. Never a real page id — nothing is
 *  ever written under it, so no migration and no `getOrCreateDatabasesRoot`-style
 *  writer is needed. */
export const CHANGE_LOG_NODE_ID = '__change_log__'

/**
 * `proposed` and `outdated` both still need a person's decision — the board's
 * proposed view lists outdated records too (an accept withdrawn, a revise
 * offered instead). `countWaiting` counts this same {@link WAITING_STATUSES}
 * set; a row's pill/plain split reads it too, so this is the one place either
 * reads the status list.
 */
export function isWaitingStatus(status: ChangeLogStatus): boolean {
  return WAITING_STATUSES.includes(status)
}

/** One record, shaped for the table: `s6o1`'s five columns. */
export interface LogRow {
  record: ChangeLogRecord
  /** The "what" column — through `describeChange`, never a second labelling path. */
  label: string
  /** The "page" column. */
  page: string
  /** The "by" column — `record.actor` verbatim (only `you`/`pond` exist today). */
  by: string
  /** The "status" column: a pill for a status still waiting on a person, plain
   *  mono text otherwise (s6o1: `outdated` is boxed, `accepted` is not). */
  status: { kind: 'pill' | 'plain'; text: ChangeLogStatus }
}

/** Rows newest-first within one day header, s6o1's grouping. */
export interface LogDayGroup {
  label: string
  rows: LogRow[]
}

const DAY_MS = 86_400_000

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** `today` / `yesterday` / else a short date (`Sep 5`) — matching the register
 *  `RollupValue`'s date cells already use, not a new one. Local calendar days,
 *  so the boundary falls at the person's own midnight. */
export function dayHeaderLabel(iso: string, now: Date): string {
  const created = new Date(iso)
  const diffDays = Math.round((startOfDay(now) - startOfDay(created)) / DAY_MS)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** `09:24` today, `yesterday 17:05` / `Sep 5 17:05` otherwise — for a surface
 *  that names one moment inline (the proposed view's card) rather than
 *  grouping rows under a day header the way `buildLogRows` does. */
export function dayTimeLabel(iso: string, now: Date = new Date()): string {
  const day = dayHeaderLabel(iso, now)
  const time = formatClockTime(iso)
  return day === 'today' ? time : `${day} ${time}`
}

/** The "page" column: the title of `targetPageId`, `memory` for a memory note
 *  with no page, or `deleted page` once the target no longer resolves. Also
 *  the proposed view's own card head's page name (`proposed-view.ts`) — one
 *  label path for both. */
export function pageLabel(record: ChangeLogRecord, pageTitleById: Map<string, string>): string {
  if (record.targetPageId === null) {
    return record.action === 'memory_note' ? 'memory' : 'deleted page'
  }
  return pageTitleById.get(record.targetPageId) ?? 'deleted page'
}

/**
 * The log's rows, grouped by day header — newest first, as `listRecords`
 * returns them; this never re-sorts. `now` defaults to the real clock; a
 * caller (a test) passes a fixed one so `today`/`yesterday` don't depend on
 * when the test runs.
 */
export function buildLogRows(
  records: ChangeLogRecord[],
  pageTitleById: Map<string, string>,
  now: Date = new Date()
): LogDayGroup[] {
  const byId = new Map(records.map((r) => [r.id, r]))
  const groups: LogDayGroup[] = []

  for (const record of records) {
    const groupLabel = dayHeaderLabel(record.createdAt, now)
    const reverts = byId.get(record.links.revertOf ?? '') ?? null
    const row: LogRow = {
      record,
      label: describeChange(record, reverts, byId),
      page: pageLabel(record, pageTitleById),
      by: record.actor,
      status: { kind: isWaitingStatus(record.status) ? 'pill' : 'plain', text: record.status },
    }

    const lastGroup = groups[groups.length - 1]
    if (lastGroup !== undefined && lastGroup.label === groupLabel) {
      lastGroup.rows.push(row)
    } else {
      groups.push({ label: groupLabel, rows: [row] })
    }
  }

  return groups
}
