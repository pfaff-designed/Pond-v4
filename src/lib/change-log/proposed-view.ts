/**
 * The change log's `proposed` view model (KAN-96; board `Pond 06.15 Change
 * log`, frame `s6o2`).
 *
 * One card per record still waiting on a decision. This item builds only the
 * card's head row — page name, the outdated status pill, and `from <actor> ·
 * HH:MM` (or `· yesterday HH:MM` for an older day) — reusing the same
 * label/clock helpers the `all` view's table already reads (`pageLabel`,
 * `dayTimeLabel`, `labelForStatus`) so the two views can never describe the
 * same record differently.
 *
 * Pure — derived from records and a page-title lookup the caller already
 * has. No Supabase, no React.
 */

import type { Block } from '@/lib/documents/types'
import type { ChangePreview } from '@/lib/modules/preview'
import { jsonEqual } from '@/lib/json-equal'
import { ALREADY_DECIDED } from './answer'
import { dayHeaderLabel, dayTimeLabel, pageLabel } from './log-page'
import { formatClockTime } from './page-changes'
import { refusalForAccept } from './resolve'
import { indexById, readBlockSnapshot } from './revert-plan'
import { canAccept, labelForStatus } from './status'
import type { ChangeLogRecord } from './types'

export interface ProposedCard {
  record: ChangeLogRecord
  pageName: string
  /** The outdated status pill's text, or `null` for a live `proposed` record
   *  — s6o2 draws the pill only once a record's accept has been withdrawn. */
  statusPill: string | null
  /** `from pond · 09:24` / `from you · yesterday 17:05`. */
  actorTime: string
  /** The reason line for a record whose accept is withdrawn — what changed
   *  and when, read off the record's own `outdated` transition, falling back
   *  to `resolve.ts`'s generic refusal text. `null` for a live `proposed`
   *  record, which draws no reason line at all. */
  reasonLine: string | null
  /** The card's diff rows, each ready for `ChangeRows`. Empty when the
   *  record's before/after is not a block snapshot (a collection tool). */
  diffRows: ChangePreview[]
}

/** The record's own `outdated` transition says WHEN the page moved on; a
 *  record with none (shouldn't happen for a genuinely outdated one, but the
 *  log is append-only and older records predate this line) falls back to the
 *  generic refusal text. The mono surface reads lowercase (PROJECT_RULES),
 *  so "pond" here, never "Pond". */
function buildReasonLine(record: ChangeLogRecord, now: Date): string | null {
  if (canAccept(record.status)) return null
  const transition = [...record.transitions].reverse().find((t) => t.status === record.status)
  if (transition) {
    const day = dayHeaderLabel(transition.at, now)
    const time = formatClockTime(transition.at)
    const when = day === 'today' ? `at ${time}` : `${day} at ${time}`
    return `the page changed ${when} — ask pond to revise it`
  }
  return refusalForAccept(record.status) ?? ALREADY_DECIDED
}

/**
 * The card's diff rows: each block the before/after snapshots disagree on,
 * zipped by id — never by position, the same reasoning `touchedBlockIds`
 * (`revert-plan.ts`) already uses. A block in both, changed, is `edit` (its
 * row renders the − line, then the +, via `ChangeRows`'s differ branch); a
 * block only in `after` is `create` (+ row alone); a block dropped from
 * `after` is `remove` (− row alone). Ordered by `after`'s own order, then any
 * removed blocks in `before`'s order — the page's own reading order.
 */
export function buildDiffRows(before: Block[], after: Block[]): ChangePreview[] {
  const beforeById = indexById(before)
  const afterById = indexById(after)
  const rows: ChangePreview[] = []
  for (const block of after) {
    const prior = beforeById.get(block.id) ?? null
    if (prior && jsonEqual(prior, block)) continue
    rows.push({ op: prior ? 'edit' : 'create', before: prior, after: block })
  }
  for (const block of before) {
    if (!afterById.has(block.id)) rows.push({ op: 'remove', before: block, after: null })
  }
  return rows
}

/** One card per record, in the order `records` gave them (newest first, as
 *  `listRecords` already returns `WAITING_STATUSES`). `now` defaults to the
 *  real clock; a caller (a test) passes a fixed one so the day-aware label
 *  doesn't depend on when the test runs — same convention as `buildLogRows`. */
export function buildProposedCards(
  records: ChangeLogRecord[],
  pageTitleById: Map<string, string>,
  now: Date = new Date()
): ProposedCard[] {
  return records.map((record) => ({
    record,
    pageName: pageLabel(record, pageTitleById),
    statusPill: record.status === 'outdated' ? labelForStatus(record.status) : null,
    actorTime: `from ${record.actor} · ${dayTimeLabel(record.createdAt, now)}`,
    reasonLine: buildReasonLine(record, now),
    diffRows: buildDiffRows(
      readBlockSnapshot(record.before) ?? [],
      readBlockSnapshot(record.after) ?? []
    ),
  }))
}
