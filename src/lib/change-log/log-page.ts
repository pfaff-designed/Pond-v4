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

import { formatClockTime } from './page-changes'
import { recordTitle } from './record-page'
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
  /** The "what" column — `recordTitle`, the SAME string the record page's own
   *  38px title shows, falling back through its own `describeChange` for a
   *  non-block action or a block action with no live snapshot to diff. */
  label: string
  /** The "page" column. */
  page: string
  /** The "by" column — `record.actor` verbatim (only `you`/`pond` exist today). */
  by: string
  /** The "status" column: a pill for a status still waiting on a person, plain
   *  mono text otherwise (s6o1: `outdated` is boxed, `accepted` is not). */
  status: { kind: 'pill' | 'plain'; text: ChangeLogStatus }
}

/** Rows newest-first within one group — a day header (`buildLogRows`) or a
 *  page (`buildLogPageGroups`); both share this shape, only the grouping key
 *  differs. `key` is the grouping key itself (stable across a label a second
 *  group could repeat, e.g. two unresolved pages both labelled "deleted
 *  page"); React keys off it, never off `label` or array index. */
export interface LogGroup {
  key: string
  label: string
  rows: LogRow[]
}

export const DAY_MS = 86_400_000

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Whole calendar days between two moments, local calendar (midnight is the
 *  boundary) — the one day-math primitive every change-log surface rounds
 *  with: `dayHeaderLabel` here, the page-changes panel's `panelTimeLabel`,
 *  and the deleted view's `whenLabel`. */
export function daysBetween(now: Date, iso: string): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)
}

/** `today` / `yesterday` / else a short date (`Sep 5`) — matching the register
 *  `RollupValue`'s date cells already use, not a new one. Local calendar days,
 *  so the boundary falls at the person's own midnight. */
export function dayHeaderLabel(iso: string, now: Date): string {
  const diffDays = daysBetween(now, iso)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** `09:24` today, `yesterday 17:05` / `Sep 5 17:05` otherwise — for a surface
 *  that names one moment inline (the proposed view's card) rather than
 *  grouping rows under a day header the way `buildLogRows` does. */
export function dayTimeLabel(iso: string, now: Date = new Date()): string {
  const day = dayHeaderLabel(iso, now)
  const time = formatClockTime(iso)
  return day === 'today' ? time : `${day} ${time}`
}

/** A record with no `targetPageId` is either a memory note or one whose
 *  target no longer resolves — the one `action === 'memory_note'` check both
 *  {@link pageLabel} and `pageGroupKey` need, so neither repeats it. */
function nullTargetKind(record: ChangeLogRecord): 'memory' | 'deleted' {
  return record.action === 'memory_note' ? 'memory' : 'deleted'
}

/** The "page" column: the title of `targetPageId`, `memory` for a memory note
 *  with no page, or `deleted page` once the target no longer resolves. Also
 *  the proposed view's own card head's page name (`proposed-view.ts`) — one
 *  label path for both. */
export function pageLabel(record: ChangeLogRecord, pageTitleById: Map<string, string>): string {
  if (record.targetPageId === null) {
    return nullTargetKind(record) === 'memory' ? 'memory' : 'deleted page'
  }
  return pageTitleById.get(record.targetPageId) ?? 'deleted page'
}

/** One record shaped into {@link LogRow} — the part every grouping (day,
 *  page) shares; only the grouping key differs between them. */
function buildLogRow(record: ChangeLogRecord, pageTitleById: Map<string, string>): LogRow {
  return {
    record,
    label: recordTitle(record),
    page: pageLabel(record, pageTitleById),
    by: record.actor,
    status: { kind: isWaitingStatus(record.status) ? 'pill' : 'plain', text: record.status },
  }
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
): LogGroup[] {
  const groups: LogGroup[] = []

  for (const record of records) {
    const groupLabel = dayHeaderLabel(record.createdAt, now)
    const row = buildLogRow(record, pageTitleById)

    const lastGroup = groups[groups.length - 1]
    if (lastGroup !== undefined && lastGroup.key === groupLabel) {
      lastGroup.rows.push(row)
    } else {
      groups.push({ key: groupLabel, label: groupLabel, rows: [row] })
    }
  }

  return groups
}

/** `targetPageId`, but split so a memory note and a deleted-target record —
 *  both `null` — land in their own groups rather than merging under one,
 *  sharing {@link nullTargetKind}'s decision with `pageLabel`. */
function pageGroupKey(record: ChangeLogRecord): string {
  if (record.targetPageId !== null) return record.targetPageId
  return nullTargetKind(record) === 'memory' ? '__memory__' : '__deleted_no_target__'
}

/**
 * The log's rows grouped by page — `by page` (`s6o1`), reusing `LogGroup`
 * with the page title as `label` and `pageGroupKey`'s grouping key as `key`.
 * `records` is assumed already newest-first (as `listRecords` returns them),
 * so the first record seen for a page is that group's newest, which is also
 * the order groups come out in — no re-sort needed for either the groups or
 * the rows inside one.
 */
export function buildLogPageGroups(
  records: ChangeLogRecord[],
  pageTitleById: Map<string, string>
): LogGroup[] {
  const groups: LogGroup[] = []
  const groupIndexByKey = new Map<string, number>()

  for (const record of records) {
    const row = buildLogRow(record, pageTitleById)
    const key = pageGroupKey(record)
    const existingIndex = groupIndexByKey.get(key)

    if (existingIndex !== undefined) {
      groups[existingIndex].rows.push(row)
    } else {
      groupIndexByKey.set(key, groups.length)
      groups.push({ key, label: row.page, rows: [row] })
    }
  }

  return groups
}
