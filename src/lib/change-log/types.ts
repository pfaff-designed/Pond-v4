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
