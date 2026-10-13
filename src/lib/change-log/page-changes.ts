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

import { AREA_COLOUR_SWATCHES, GLYPH_LIBRARY, isAreaRole } from '@/lib/rail/glyph-library'
import { canRevertRecord } from './revert-plan'
import { summarizeAddedRow, summarizeBlockEdit, summarizeRowEdit } from './summary'
import type { ChangeLogRecord } from './types'

export interface PageChangeRow {
  record: ChangeLogRecord
  /** A short human line for the row — what this change was. */
  label: string
  /** Offer a revert on this row? */
  revertable: boolean
  /** Why not, when `revertable` is false and the reason is worth saying. */
  revertBlockedBy: 'waiting' | null
  /** When this row IS a revert: the record it sets back, if it is on this page. */
  reverts: ChangeLogRecord | null
}

/** `09:31` — how a revert names the change it sets back. */
const clockTime = (record: ChangeLogRecord): string =>
  new Date(record.createdAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

/** `flower-02`, `161`, or `automatic` for null — the library's label, unchanged. */
const glyphName = (glyph: string | null): string => {
  if (glyph === null) return 'automatic'
  const entry = GLYPH_LIBRARY.find((g) => g.glyph === glyph)
  return entry?.label ?? glyph
}

/** `sage`, `mist`, `navy`, or `ink` for null — the colour picker's own labels. */
const areaRoleName = (role: unknown): string =>
  AREA_COLOUR_SWATCHES.find((s) => s.role === (isAreaRole(role) ? role : null))?.label ?? 'ink'

/**
 * Chase an `undo`/`redo` record's link through as many more `undo`/`redo`
 * records as a session stack can pile on (⌘Z, ⇧⌘Z, ⌘Z, …) to the original
 * record being laid back, so a row never nests a second `undo ·`/`redo ·`
 * onto another — matching `change_log_undo_kind`'s own loop (0023). `undefined`
 * when a link is missing or points off this page.
 */
const resolveUndoRedoTarget = (
  record: ChangeLogRecord,
  byId: Map<string, ChangeLogRecord>
): ChangeLogRecord | undefined => {
  let current: ChangeLogRecord | undefined = record
  const seen = new Set<string>()
  while (current !== undefined && (current.action === 'undo' || current.action === 'redo')) {
    if (seen.has(current.id)) return undefined
    seen.add(current.id)
    const link: string | undefined =
      current.action === 'undo' ? current.links.undoOf : current.links.redoOf
    current = link === undefined ? undefined : byId.get(link)
  }
  return current
}

/**
 * A short label for a record.
 *
 * An edit reads as what its diff did ("wrote 3 paragraphs", `summary.ts`); a
 * record edit names the record. The full before/after, rendered block by block,
 * stays the record page's — this is one line for a row.
 *
 * `byId` resolves an undo/redo row's own label from the record it undid or
 * redid (board 6o f5: "undo · added chickpeas, harissa"). `links.redoOf` names
 * the record that was put back directly — migration 0021 inserts it as the id
 * passed to `redo_change_log_record`, the same original id `undo_of` named, not
 * the standing undo record — verified against `change-log-undo.pglite.test.ts`
 * ("links: { redo_of: edit }"), not the ticket's own guess. A record missing
 * from `byId` (a different page, or paged out) falls back to the plain word.
 */
export function describeChange(
  record: ChangeLogRecord,
  reverts: ChangeLogRecord | null,
  byId: Map<string, ChangeLogRecord> = new Map()
): string {
  switch (record.action) {
    case 'edit':
      return summarizeBlockEdit(record.before, record.after) ?? 'edited this page'
    case 'revert': {
      const revertsRecord = reverts ?? byId.get(record.links.revertOf ?? '') ?? null
      return revertsRecord === null
        ? 'revert of an earlier change'
        : `revert of ${clockTime(revertsRecord)}`
    }
    case 'create_page':
      return 'created this page'
    case 'define_schema':
      return 'set up the fields'
    case 'add_row':
      return summarizeAddedRow(record.after)
    case 'edit_row':
      return summarizeRowEdit(record.before, record.after)
    case 'promote_table':
      return 'turned a table into a database'
    case 'configure_view':
      return 'configured a view'
    case 'link_records':
      return 'linked records'
    case 'memory_note':
      return 'recorded a memory note'
    case 'edit_glyph':
      return `mark → ${glyphName(typeof record.after === 'string' ? record.after : null)}`
    case 'edit_area_role':
      return `colour → ${areaRoleName(record.after)}`
    case 'delete':
      return 'deleted'
    case 'move':
      return 'moved'
    case 'undo': {
      const original = resolveUndoRedoTarget(record, byId)
      return original === undefined ? 'undo' : `undo · ${describeChange(original, null, byId)}`
    }
    case 'redo': {
      const original = resolveUndoRedoTarget(record, byId)
      return original === undefined ? 'redo' : `redo · ${describeChange(original, null, byId)}`
    }
    default:
      // Reachable, despite the union looking exhaustive: 0011 gives `action` NO
      // CHECK on purpose — "a new tool can be logged without a migration" — and
      // `mapChangeLogRow` casts the column to `ChangeLogAction`. A record written
      // by a later build lands here, and showing its raw action beats a blank row.
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
    // The `reverted by` backlink is computed but not exposed: this panel says only
    // whether a revert is already waiting. Rendering the linked record itself is
    // the record page's job (#147), which queries `listRevertsOf` for it.
    const waiting = (revertsOf.get(record.id) ?? []).some((r) => r.status === 'proposed')
    const revertable = canRevertRecord(record) && !waiting
    const reverts = byId.get(record.links.revertOf ?? '') ?? null
    return {
      record,
      label: describeChange(record, reverts, byId),
      revertable,
      revertBlockedBy: !revertable && waiting ? 'waiting' : null,
      reverts,
    }
  })
}
