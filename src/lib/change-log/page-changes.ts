/**
 * The "changes to this page" view model (issue #103, storyboard frame 8).
 *
 * "Every page can show its own changes: the log filtered to that page, in a
 * floating panel." — "the panel is a view of the log, not a second history."
 *
 * This is the SURFACE #103's third acceptance bullet asks for ("reachable from
 * the change-log surface"), and deliberately only that. A row names and times a
 * change and opens its record page (KAN-152/#147); it answers nothing itself —
 * accept/reject/revert are the record page's own controls.
 *
 * Pure — the rows are derived from records the caller already has. No Supabase,
 * no React, no formatting decisions beyond a short human label.
 */

import { AREA_COLOUR_SWATCHES, GLYPH_LIBRARY, isAreaRole } from '@/lib/rail/glyph-library'
import { blockSchema } from '@/lib/modules/content'
import {
  summarizeAddedRow,
  summarizeBlockEdit,
  summarizeRemovedRow,
  summarizeRowEdit,
  summarizeSchemaEdit,
  summarizeTrash,
} from './summary'
import type { ChangeLogRecord, MoveSnapshot } from './types'

/** `09:31` for a raw ISO timestamp — split out from {@link clockTime} so a
 *  surface naming a moment that isn't a record's own `createdAt` (a
 *  transition's `at`, say) formats it the same way. */
export const formatClockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

/** `09:31` — how a revert names the change it sets back; also the log table's
 *  "time" column, so there is one clock-formatting path, not two. */
export const clockTime = (record: ChangeLogRecord): string => formatClockTime(record.createdAt)

/** `flower-02`, `161`, or `automatic` for null — the library's label, unchanged. */
const glyphName = (glyph: string | null): string => {
  if (glyph === null) return 'automatic'
  const entry = GLYPH_LIBRARY.find((g) => g.glyph === glyph)
  return entry?.label ?? glyph
}

/** The panel head's own shortcut text (board `s6o8`): ⌥⌘H on a Mac, Ctrl+Alt+H elsewhere. */
export function platformShortcutLabel(isMac: boolean): string {
  return isMac ? '⌥⌘H' : 'Ctrl+Alt+H'
}

/**
 * `colour → sage` / `colour → mist` / `colour → navy` / `colour → ink` for
 * null — the colour picker's own labels. A non-null value that names no
 * known role falls back to a generic phrase rather than naming a colour the
 * page doesn't have.
 */
const areaRoleChange = (role: unknown): string => {
  if (role === null) return 'colour → ink'
  if (!isAreaRole(role)) return 'changed the colour'
  const label = AREA_COLOUR_SWATCHES.find((s) => s.role === role)?.label
  return label === undefined ? 'changed the colour' : `colour → ${label}`
}

/** One `MoveSnapshot.removedLinks` entry, read back off one array element (or
 *  off the whole value, for a pre-this-fix record's singular `removedLink`
 *  object) — `undefined` for a malformed entry, never thrown. Reuses
 *  `content.ts`'s own `blockSchema` for `block` rather than re-describing a
 *  page-link block's shape a second time (AGENTS.md DRY), the same way
 *  `child-links.ts`'s `removedLinkSchema` does. */
const readRemovedLinkEntry = (
  value: unknown
): NonNullable<MoveSnapshot['removedLinks']>[number] | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const { block, index } = value as Record<string, unknown>
  if (typeof index !== 'number') return undefined
  const parsed = blockSchema.safeParse(block)
  if (!parsed.success) return undefined
  return { block: parsed.data, index }
}

/** A `MoveSnapshot.removedLinks`, read back off `before.removedLinks` — an
 *  array of entries for a record this fix wrote, or a single object for a
 *  pre-this-fix record (normalized into a one-entry array so every caller
 *  reads one shape). `undefined` for a pre-KAN-467 record (no link fields
 *  yet), an empty/all-malformed array, or a malformed singular object,
 *  never thrown. Drops any one malformed array entry rather than failing
 *  the whole snapshot — the same per-entry tolerance `child-links.ts`'s
 *  `parseUnlinkedLinks` has for hand-editable jsonb. */
const readRemovedLinks = (value: unknown): MoveSnapshot['removedLinks'] | undefined => {
  if (Array.isArray(value)) {
    const parsed = value.flatMap((entry) => {
      const one = readRemovedLinkEntry(entry)
      return one ? [one] : []
    })
    return parsed.length > 0 ? parsed : undefined
  }
  const single = readRemovedLinkEntry(value)
  return single ? [single] : undefined
}

/** A `move` record's `after` (or `before`), typed — or `null` for a
 *  pre-KAN-466 record (no `MoveSnapshot` yet) or a malformed one. Exported
 *  so a caller that needs the structured snapshot itself (the Rail toast)
 *  reads it the same checked way, rather than an unchecked `as MoveSnapshot`
 *  cast of its own. `removedLinks`/`appendedLinkId` (KAN-467) are each
 *  optional and read independently, so an old-shape record with neither
 *  still parses, and a malformed `removedLinks` alone doesn't fail the rest
 *  of the snapshot. A pre-this-fix record's singular `removedLink` reads the
 *  same way, via `readRemovedLinks`'s own fallback. */
export const readMoveSnapshot = (value: unknown): MoveSnapshot | null => {
  if (typeof value !== 'object' || value === null) return null
  const { parentId, parentTitle, siblingOrder, removedLinks, removedLink, appendedLinkId } =
    value as Record<string, unknown>
  if (typeof parentId !== 'string' && parentId !== null) return null
  if (typeof parentTitle !== 'string' && parentTitle !== null) return null
  if (!Array.isArray(siblingOrder) || !siblingOrder.every((id) => typeof id === 'string')) {
    return null
  }
  const parsedRemovedLinks = readRemovedLinks(removedLinks ?? removedLink)
  return {
    parentId,
    parentTitle,
    siblingOrder,
    ...(parsedRemovedLinks !== undefined ? { removedLinks: parsedRemovedLinks } : {}),
    ...(typeof appendedLinkId === 'string' ? { appendedLinkId } : {}),
  }
}

/**
 * A `MoveSnapshot.parentTitle` is never rendered bare — `null` (no home row to
 * name the top level) falls back to `rootFallback` (the caller's own root
 * label; the change log has none, so its default is `'Untitled'` same as the
 * other case), and `''` (a live but untitled parent) always falls back to
 * `'Untitled'`, matching the dragged title's own 'Untitled' fallback.
 */
export const moveParentLabel = (parentTitle: string | null, rootFallback = 'Untitled'): string => {
  if (parentTitle === null) return rootFallback
  return parentTitle === '' ? 'Untitled' : parentTitle
}

/** `moved to <parent title>`, or the bare `moved` when `after` isn't a
 *  `MoveSnapshot` (a pre-KAN-466 record, or malformed). */
const moveTarget = (after: unknown): string => {
  const snapshot = readMoveSnapshot(after)
  return snapshot === null ? 'moved' : `moved to ${moveParentLabel(snapshot.parentTitle)}`
}

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
 * the redone record directly (0021). A record missing from `byId` (a
 * different page, or paged out) falls back to the plain word.
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
    case 'edit_schema':
      return summarizeSchemaEdit(record.before, record.after)
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
      return areaRoleChange(record.after)
    // `delete`'s snapshot is the subtree as it stood before trashing (`before`);
    // `restore`'s is the subtree as it lands back (`after`) — the RPCs that
    // write these records (KAN-97) mirror that split.
    case 'delete':
      return summarizeTrash(record.before, 'deleted')
    case 'restore':
      return summarizeTrash(record.after, 'restored')
    case 'move':
      return moveTarget(record.after)
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
 * What undoing/redoing `original` did, past tense, read backwards from its own
 * diff — the undo notice's body (board `s6o5`: "removed chickpeas, harissa"),
 * never the log row's own `undo · …` label ({@link describeChange}'s `undo`/
 * `redo` case, which describes the row, not the effect). `summarizeBlockEdit`
 * and `summarizeRowEdit` are direction-agnostic by diff, so swapping
 * before/after already reads as the reverse.
 */
export function describeUndoneEffect(original: ChangeLogRecord): string {
  switch (original.action) {
    case 'add_row':
      return summarizeRemovedRow(original.after)
    case 'edit':
      return summarizeBlockEdit(original.after, original.before) ?? 'edited this page'
    case 'edit_row':
      return summarizeRowEdit(original.after, original.before)
    default:
      return describeChange(original, null)
  }
}
