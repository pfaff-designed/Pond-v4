/**
 * The change log record page's view model (KAN-152; board
 * `Pond 06.15 Change log`, frames `s6o3`/`s6o4`).
 */

import type { Block } from '@/lib/documents/types'
import type { ChangePreview } from '@/lib/modules/preview'
import { blockLabel } from '@/lib/modules/types'
import { descriptorFor, resolveDescriptor } from '@/lib/modules/registry'
import { CHANGE_LOG_NODE_ID, pageLabel } from './log-page'
import { clockTime, describeChange, formatClockTime } from './page-changes'
import { buildDiffRows } from './proposed-view'
import { readBlockSnapshot } from './revert-plan'
import { labelForStatus } from './status'
import { BLOCK_ACTIONS, type ChangeLogRecord } from './types'

/** The search param naming which record the change log page's route opens. */
export const RECORD_PARAM = 'record'

/** The workspace URL for one record's page — one more param on the existing
 *  `?nodeId=__change_log__` change log route, not a new router concept. */
export function changeLogRecordUrl(recordId: string): string {
  const params = new URLSearchParams({ nodeId: CHANGE_LOG_NODE_ID, [RECORD_PARAM]: recordId })
  return `?${params.toString()}`
}

/**
 * The record page's title: the changed block's own preview text
 * ("electrician, second fix → w/c 6 oct"), through the block registry's
 * `preview` facet. Falls back to `describeChange`'s plain label for every
 * non-block action, and for a block action whose snapshot doesn't carry
 * `targetBlockId` (nothing live to preview).
 *
 * The block itself is read from the record's OWN `after` (falling back to
 * `before`) — the title names what this record changed, not the page as it
 * reads today. `blocks` are the target page's current page-mates (ticket-23
 * siblings), passed by a caller that has them in hand; omit when it doesn't.
 */
export function recordTitle(record: ChangeLogRecord, blocks?: readonly Block[]): string {
  const snapshot = readBlockSnapshot(record.after) ?? readBlockSnapshot(record.before)
  const block = snapshot?.find((b) => b.id === record.targetBlockId)
  if (block === undefined) return describeChange(record, null)
  return resolveDescriptor(block.type).preview(block, blocks)
}

/**
 * The fields grid's "status" row: `labelForStatus`'s word, the actor of the
 * transition that landed the CURRENT status, and that transition's clock time
 * — "accepted by you · 09:31". `transitions` is append-only, so its last entry
 * is always the one that produced `record.status`/`statusAt`; a record with no
 * transitions yet (a fixture, or a status predating this column) falls back to
 * the record's own `actor`. One status-labelling and one clock-formatting
 * path, reused rather than duplicated.
 */
export function statusField(record: ChangeLogRecord): string {
  const actor = record.transitions.at(-1)?.actor ?? record.actor
  return `${labelForStatus(record.status)} by ${actor} · ${formatClockTime(record.statusAt)}`
}

/** The fields grid's "proposed by" row: who proposed the record and when —
 *  "pond · 09:20". */
export function proposedByField(record: ChangeLogRecord): string {
  return `${record.actor} · ${clockTime(record)}`
}

/** The fields grid's "page" row: the target page's title, plus the changed
 *  block's own label when one resolves. The block is read off the record's
 *  OWN snapshot first (what it actually changed), falling back to the page's
 *  CURRENT page-mates (`blocks`, ticket-23 siblings) — a collection-tool
 *  record's snapshot is a {@link import('./types').RowSnapshot}, not a block
 *  array, so its containing block (the database) is only findable live. */
export interface PageBlockField {
  page: string
  block: string | null
}

/** The fields grid's "read" row: the chip strings Pond read before proposing
 *  (KAN-47's provenance chips). `record.read` is `unknown` at the storage
 *  boundary — a tolerant parse, not a schema: an array of strings passes
 *  through as-is, anything else (null, a stray object, a malformed row) is
 *  read as "nothing to show" rather than thrown. */
export function readChipsOf(record: ChangeLogRecord): string[] {
  const { read } = record
  if (Array.isArray(read) && read.every((entry) => typeof entry === 'string')) {
    return read as string[]
  }
  return []
}

/** The fields grid's "reverted by" row: the newest revert of this record,
 *  when one exists — frame s6o4. `reverts` is `listRevertsOf`'s result
 *  (newest first); only the first (newest) one is shown. */
export interface RevertedByField {
  recordId: string
  /** "revert · 10:02" — the word, not just the clock time, since this is the
   *  ONLY place a revert names itself that way (every other clock label on
   *  the page is bare HH:MM). */
  clockLabel: string
  /** The linked pill's text — the revert record's own current status. */
  statusPillText: string
}

export function revertedByField(reverts: ChangeLogRecord[]): RevertedByField | null {
  const newest = reverts[0]
  if (newest === undefined) return null
  return {
    recordId: newest.id,
    clockLabel: `revert · ${clockTime(newest)}`,
    statusPillText: labelForStatus(newest.status),
  }
}

export function pageBlockField(
  record: ChangeLogRecord,
  pageTitleById: Map<string, string>,
  blocks: readonly Block[] = []
): PageBlockField {
  const page = pageLabel(record, pageTitleById)
  const snapshot = readBlockSnapshot(record.after) ?? readBlockSnapshot(record.before)
  const block =
    snapshot?.find((b) => b.id === record.targetBlockId) ??
    blocks.find((b) => b.id === record.targetBlockId)
  if (block === undefined) return { page, block: null }
  return { page, block: blockLabel(block) ?? (descriptorFor(block.type)?.label ?? block.type) }
}

/** The "before → after" card's rows — only for a {@link BLOCK_ACTIONS} record
 *  (`edit`/`revert`), whose snapshots are block arrays. `null` for every
 *  other action (a collection tool's snapshot is a `RowSnapshot`, not a block
 *  array); the component falls back to one plain-text line there. Reuses
 *  `buildDiffRows` verbatim — the same zip-by-id the `proposed` view's cards
 *  already use, never a second diffing path. */
export function recordDiffRows(record: ChangeLogRecord): ChangePreview[] | null {
  if (!BLOCK_ACTIONS.includes(record.action)) return null
  return buildDiffRows(readBlockSnapshot(record.before) ?? [], readBlockSnapshot(record.after) ?? [])
}
