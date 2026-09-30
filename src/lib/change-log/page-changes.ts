/**
 * The "changes to this page" view model (issue #103, storyboard frame 8).
 *
 * "Every page can show its own changes: the log filtered to that page, in a
 * floating panel." — "the panel is a view of the log, not a second history."
 *
 * This is the SURFACE #103's third acceptance bullet asks for ("reachable from
 * the change-log surface"), and deliberately only that. The pond-wide
 * `databases › change log` with its `all / proposed / by page / memory / deleted`
 * saved views, the "N proposed, waiting on you" figure and the full record page
 * are #147; none of them exist yet, and nothing here pre-empts their shape. What
 * this panel owes #103 is a place to raise a revert and answer it.
 *
 * Pure — the rows are derived from records the caller already has. No Supabase,
 * no React, no formatting decisions beyond a short human label.
 */

import { canRevertRecord } from './revert'
import type { ChangeLogRecord } from './types'

export interface PageChangeRow {
  record: ChangeLogRecord
  /** A short human line for the row — what this change was. */
  label: string
  /** Offer a revert on this row? */
  revertable: boolean
  /** Why not, when `revertable` is false and the reason is worth saying. */
  revertBlockedBy: 'waiting' | null
  /**
   * The reverts aimed at this record, newest first — the design's `reverted by`
   * field. Derived from `links.revertOf`, because 0011 freezes `links` at insert
   * and the original never gains a pointer back.
   */
  revertedBy: ChangeLogRecord[]
  /** When this row IS a revert: the record it sets back, if it is on this page. */
  reverts: ChangeLogRecord | null
}

/**
 * A short label for a record.
 *
 * Deliberately coarse. The design's row reads "electrician → w/c 6 oct", which is
 * the DIFF rendered through the registry's `preview` facet — that belongs to the
 * record page in #147, along with the before/after it sits above. Inventing a
 * thinner version of it here would be a second implementation to reconcile later,
 * so this says what happened and leaves what changed to the surface that shows it.
 */
export function describeChange(record: ChangeLogRecord, reverts: ChangeLogRecord | null): string {
  switch (record.action) {
    case 'edit':
      return 'edited this page'
    case 'revert':
      return reverts === null ? 'revert of an earlier change' : `revert of ${reverts.action}`
    case 'create_page':
      return 'created this page'
    case 'define_schema':
      return 'set up the properties'
    case 'add_row':
      return 'added a row'
    case 'promote_table':
      return 'turned a table into a collection'
    case 'configure_view':
      return 'configured a view'
    case 'link_records':
      return 'linked records'
    case 'memory_note':
      return 'recorded a memory note'
    case 'delete':
      return 'deleted'
    case 'move':
      return 'moved'
    case 'undo':
      return 'undo'
    case 'redo':
      return 'redo'
    default:
      return record.action
  }
}

/**
 * Turn a page's records (newest first, as `listRecords` returns them) into rows.
 *
 * A revert is offered only where the log genuinely allows one: an accepted `edit`
 * with a block snapshot to set back, and no revert of it already waiting. That
 * second condition is the panel's half of the guard `proposeRevert` enforces —
 * the button goes away rather than throwing when it is pressed.
 */
export function buildPageChanges(records: ChangeLogRecord[]): PageChangeRow[] {
  const byId = new Map(records.map((r) => [r.id, r]))

  const revertsOf = new Map<string, ChangeLogRecord[]>()
  for (const record of records) {
    const target = record.links.revertOf
    if (target === undefined) continue
    const list = revertsOf.get(target)
    if (list) list.push(record)
    else revertsOf.set(target, [record])
  }

  return records.map((record) => {
    const revertedBy = revertsOf.get(record.id) ?? []
    const waiting = revertedBy.some((r) => r.status === 'proposed')
    const revertable = canRevertRecord(record) && !waiting
    return {
      record,
      label: describeChange(record, byId.get(record.links.revertOf ?? '') ?? null),
      revertable,
      revertBlockedBy: !revertable && waiting ? 'waiting' : null,
      revertedBy,
      reverts: byId.get(record.links.revertOf ?? '') ?? null,
    }
  })
}
