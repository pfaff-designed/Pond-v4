/**
 * The durable change log (issue #102, spec #110 — direction LOCKED = Option A).
 *
 * Design law: "change log — A database in every pond holding one record for each
 * action taken, by you or by Pond. Each record is a diff with its before and
 * after state and its status." One row in `public.change_log` = one record =
 * one diff.
 *
 * This replaces the ephemeral `{messages, resolutions}` transcript envelope as
 * the SOURCE OF TRUTH for what changed. `ConversationResolutions`
 * (lib/conversation/resolutions.ts) stays, demoted to a session-scoped UI cache
 * that keeps proposal cards inert across a reload and feeds `applyResolutions`;
 * it is no longer the durable record. The link between the two is
 * `sourceThreadId` + `toolCallId`, both stamped on the record.
 *
 * Pure types + constants — no Supabase, no React, server- and client-safe.
 */

import type { Block } from '@/lib/modules/content'

/**
 * THE EIGHT. The design names exactly these, and the DB CHECK in migration 0011
 * mirrors the list — a ninth status is a migration, not a typo.
 *
 * - `proposed`           — Pond (or an agent, or a sharer) wants to change something.
 * - `accepted`           — applied. Your own typed edits land here directly.
 * - `rejected`           — declined outright.
 * - `changes_requested`  — you sent a note back; the proposer returns a NEW record.
 * - `outdated`           — the target moved on before this was decided; accept is
 *                          withdrawn, revise is offered.
 * - `withdrawn`          — the proposer pulled it.
 * - `undone`             — an accepted record taken back inside the session (#104).
 * - `reverted`           — an accepted record set back by a later revert (#103).
 */
export const CHANGE_LOG_STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'changes_requested',
  'outdated',
  'withdrawn',
  'undone',
  'reverted',
] as const

export type ChangeLogStatus = (typeof CHANGE_LOG_STATUSES)[number]

export function isChangeLogStatus(value: unknown): value is ChangeLogStatus {
  return (CHANGE_LOG_STATUSES as readonly unknown[]).includes(value)
}

/**
 * What produced the record. Extensible BY DESIGN — the DB column carries no
 * CHECK, so a new tool can be logged without a migration; this union is the
 * typed front door and grows by editing it.
 */
export type ChangeLogAction =
  | 'edit'
  | 'create_page'
  | 'delete'
  | 'move'
  | 'memory_note'
  | 'define_schema'
  | 'add_row'
  /** A person's own edit to a record's title or values; before/after are {@link RowSnapshot}s. */
  | 'edit_row'
  | 'promote_table'
  | 'configure_view'
  | 'link_records'
  | 'revert'
  | 'undo'
  | 'redo'
  /** A page (and its trashed subtree) brought back out of trash (KAN-97);
   *  before/after carry a {@link TrashSnapshot}. */
  | 'restore'
  /** A person's own pick in the glyph picker (KAN-248); before/after are a
   *  glyph id or null (`automatic`) — never a `Block[]`, so this stays out of
   *  {@link BLOCK_ACTIONS}. */
  | 'edit_glyph'
  /** A person's own colour pick on an area (KAN-249); before/after are an
   *  {@link AreaRole} or null (ink) — never a `Block[]`, so this stays out of
   *  {@link BLOCK_ACTIONS}. */
  | 'edit_area_role'
  /** A person's own rename or delete of a schema field from the table header
   *  menu (KAN-380); before/after are each a whole {@link PropertySchema} —
   *  never a `Block[]`, so this stays out of {@link BLOCK_ACTIONS} like the
   *  other collection tools (`define_schema`, `add_row`, `edit_row`). Written
   *  as one atomic record per commit, never grouped by pause like a row edit. */
  | 'edit_schema'
  /** A page (and its subtree) copied below the original (KAN-468); `after`
   *  carries `{pageId}` (the copy's root) and, when the parent gained a
   *  page-link for it, `appendedLinkId`/`linkParentId` — never a title, so
   *  this reads generic like {@link ChangeLogAction}'s other page-structural
   *  actions (`create_page`), not by name. */
  | 'duplicate_page'

/**
 * The actions whose before/after IS a page's `Block[]` — the ones a block write
 * makes stale, and which therefore go `outdated` together (spec #110 criterion 5).
 *
 * `edit` was the only one until #103. A revert's snapshots are block arrays in
 * exactly the same way, so a pending revert aimed at a page that has since moved
 * on must be swept with the edits; leaving it out would let a stale revert be
 * accepted later and set blocks back over changes made in between. The five
 * collection tools stay OUT — their before/after live in the page's property
 * schema and rows, so a block write says nothing about them.
 */
export const BLOCK_ACTIONS: readonly ChangeLogAction[] = ['edit', 'revert']

/**
 * A record (a collection's row) as an own `add_row` / `edit_row` stores it in
 * `before`/`after`: the row's title and its property values, `_schema` excluded.
 */
export interface RowSnapshot {
  id: string
  title: string
  values: Record<string, unknown>
  /**
   * Each field's value as the field showed it when the record was written — a
   * choice as its label, a checkbox as `✓` — keyed by field id. Kept with the
   * record because a later rename of an option must not rewrite what was logged.
   */
  shown: Record<string, string>
}

/**
 * A trashed (or restored) page's subtree as `delete`/`restore` store it: enough
 * to render the deleted-view card (s6o6) and to put the root back where it was.
 * `before` on a `delete` record; `after` on the `restore` that answers it.
 */
export interface TrashSnapshot {
  title: string
  parentId: string | null
  order: number
  /** The root and every descendant trashed together with it. */
  pageIds: string[]
  blockCount: number
  nestedPageCount: number
  /** The parent chain's titles, root first — "was in creativity › kitchen renovation". */
  parentPath: string[]
}

/**
 * A page's parent and sibling order as `move` stores it (KAN-466): enough to put
 * the page back exactly where it was. `parentTitle` is resolved at move time (the
 * pond's home page title when `parentId` is null) and frozen in the snapshot, the
 * same way `TrashSnapshot.parentPath` is — a later rename or trash of that parent
 * must not change what an old record reads. `null` when `parentId` is null and no
 * home row exists to name (`private.page_move_parent_title`); `''` for a live
 * parent that is itself untitled — a reader must fall back for both, never render
 * either bare. `siblingOrder` is the full dense order of the group named by
 * `parentId`, the moved page included.
 *
 * `removedLinks` and `appendedLinkId` (KAN-467) are the link-row edit that
 * rides inside the same record: `before.removedLinks` is every one of the
 * moved page's own `page-link` blocks as they sat on the OLD parent, each
 * with the index it sat at, so undo can put them all back exactly where they
 * were (restored in ascending index order); `after.appendedLinkId` is the id
 * of the `page-link` block appended to the NEW parent, so undo knows which
 * block to remove. Both are absent on a pre-KAN-467 record (nothing to undo)
 * and either can be absent on its own side when that side had nothing to
 * edit (no stored link to remove on the old parent, or the new parent
 * already carried a link and `apply_page_move` wrote no duplicate).
 *
 * `title` (KAN-470) is the moved page's title on that side, present only
 * when the move renamed it to dodge a sibling-title clash: `before.title`
 * is the title going in, `after.title` the suffixed one it became. Absent
 * on a pre-KAN-470 record and on every move that didn't clash.
 */
export interface MoveSnapshot {
  parentId: string | null
  parentTitle: string | null
  siblingOrder: string[]
  removedLinks?: { block: Block; index: number }[]
  appendedLinkId?: string
  title?: string
}

/**
 * A `duplicate_page` record's `after` (KAN-468, migration 0032): the copy's
 * root id, and — when the (unchanged) parent gained a page-link for it —
 * that block's id and the row it landed on. `before` is always null on the
 * original record, so there is nothing to snapshot on that side there.
 * `change_log_step` (0030) undoes by swapping before/after, so the undo
 * record it logs carries this same shape on its OWN `before` (the original's
 * `after`), with `after` null (the original's `before`) — `readDuplicatePageSnapshot`
 * (next to `readMoveSnapshot`) must be tried against both sides, same as a
 * move's. Redo of a `page`-kind record (which `duplicate_page` reuses) is
 * refused outright by `change_log_set_back` when `before` is null (0030, part
 * 2b), so a redo never reaches this snapshot at all.
 */
export interface DuplicatePageSnapshot {
  pageId: string
  appendedLinkId?: string
  linkParentId?: string
}

/**
 * Who acted. Single-user ponds today, so in practice `you` or `pond`; the column
 * is free text so a sharer's identity fits without a migration.
 */
export type ChangeLogActor = string

export const ACTOR_YOU = 'you'
export const ACTOR_POND = 'pond'

/** Related records, by id — how revise / revert / undo / redo chains stay walkable. */
export interface ChangeLogLinks {
  /** This record proposes setting back the accepted record with this id (#103). */
  revertOf?: string
  /** This record is the revision of an earlier `changes_requested` / `outdated` one. */
  revisedFrom?: string
  /** This record undoes the accepted record with this id (#104). */
  undoOf?: string
  /** This record redoes the undone record with this id (#104). */
  redoOf?: string
}

/** One entry in the append-only status audit. */
export interface ChangeLogTransition {
  status: ChangeLogStatus
  /** ISO timestamp. */
  at: string
  actor: ChangeLogActor
}

/**
 * A record in the change log, in application shape (camelCase). Records are
 * READ-ONLY to the app: what advances is `status`, via the store's transition
 * helpers, which append to `transitions` rather than rewriting anything.
 */
export interface ChangeLogRecord {
  id: string
  userId: string
  /** #312: the pond this record belongs to. `workspace` was retired by 0020. */
  pondId: string | null
  status: ChangeLogStatus
  action: ChangeLogAction
  actor: ChangeLogActor
  /** Where it applies. Null for pond-level records, or once the page is gone. */
  targetPageId: string | null
  targetBlockId: string | null
  /** Full before/after snapshots. Null when not applicable (a create has no
   *  before) or once redacted (a deleted memory note). */
  before: unknown
  after: unknown
  /** The conversation it came from, and the tool call inside it. */
  sourceThreadId: string | null
  toolCallId: string | null
  /** Read-chip provenance — what Pond read before proposing. */
  read: unknown
  links: ChangeLogLinks
  transitions: ChangeLogTransition[]
  createdAt: string
  statusAt: string
}

/** The raw `public.change_log` row shape, as PostgREST returns it. */
export interface ChangeLogRow {
  id: string
  user_id: string
  pond_id: string | null
  status: string
  action: string
  actor: string
  target_page_id: string | null
  target_block_id: string | null
  before: unknown
  after: unknown
  source_thread_id: string | null
  tool_call_id: string | null
  read: unknown
  links: unknown
  transitions: unknown
  created_at: string
  status_at: string
}
