/**
 * The "changes to this page" panel's own rows (board `Pond 06.15 Change log`,
 * frame `s6o8`).
 *
 * Lives apart from `page-changes.ts` and `record-page.ts` on purpose: a row's
 * label comes from `recordTitle` (`record-page.ts`), which itself imports
 * `clockTime`/`describeChange`/`formatClockTime` from `page-changes.ts` — so
 * building the row here, importing from both, keeps that pair from ever
 * importing each other back.
 *
 * Pure — the rows are derived from records the caller already has. No Supabase,
 * no React, no formatting decisions beyond a short human label.
 */

import type { Block } from '@/lib/documents/types'
import { daysBetween, isWaitingStatus } from './log-page'
import { formatClockTime } from './page-changes'
import { recordTitle } from './record-page'
import type { ChangeLogRecord } from './types'

export interface PageChangeRow {
  record: ChangeLogRecord
  /** The panel's own time column (`panelTimeLabel`). */
  time: string
  /** The row's label — `recordTitle`, scoped to this page's own current blocks,
   *  trimmed to a short preview for the row's own display text. */
  label: string
  /** The same label, untrimmed (`recordTitle(..., { full: true })`) — for a
   *  row's `title` attribute, so a truncated label can still be read in full. */
  fullLabel: string
  /** A pill for a status still waiting on a person (`proposed`/`outdated`), plain
   *  mono text otherwise — the same rule the log table's rows use (`log-page.ts`). */
  status: { kind: 'pill' | 'plain'; text: ChangeLogRecord['status'] }
}

/**
 * The panel's own time column (board `s6o8`, read inline): bare `09:31` for
 * today, a lowercase short weekday (`mon`) for the six days before that, else
 * a lowercase short date (`sep 5`). This is a different format from
 * `dayHeaderLabel` (`log-page.ts`) — that one always appends a clock time and
 * never names a bare weekday — so it is its own function rather than that one
 * bent to fit (AGENTS.md: a value written in a board is final).
 */
export function panelTimeLabel(iso: string, now: Date = new Date()): string {
  const diffDays = daysBetween(now, iso)
  if (diffDays === 0) return formatClockTime(iso)
  if (diffDays >= 1 && diffDays <= 6) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).toLowerCase()
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase()
}

/**
 * Turn a page's records (newest first, as `listRecords` returns them) into rows
 * for the "changes to this page" panel (board `s6o8`). The panel draws no
 * buttons — a row opens the record page, where `canRevertRecord`/`revert-plan.ts`
 * answer what a person can do with it — so a row carries only what it shows.
 */
export function buildPageChangeRows(
  records: ChangeLogRecord[],
  pageBlocks: readonly Block[]
): PageChangeRow[] {
  return records.map((record) => ({
    record,
    time: panelTimeLabel(record.createdAt),
    label: recordTitle(record, pageBlocks),
    fullLabel: recordTitle(record, pageBlocks, { full: true }),
    status: {
      kind: isWaitingStatus(record.status) ? 'pill' : 'plain',
      text: record.status,
    },
  }))
}
