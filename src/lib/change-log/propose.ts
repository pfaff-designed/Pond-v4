/**
 * Recording proposals into the change log — spec #110 criterion 2.
 *
 * "Creating a proposal inserts a `proposed` record capturing the full
 * before/after snapshot at propose time — not just a decision."
 *
 * WHY THIS LIVES SERVER-SIDE. Every proposal tool is client-resolved: none of
 * them has an `execute`, because the user reviews a card and can correct the
 * target before anything is written. So there is no tool body to log from. The
 * chat route logs each call as it is EMITTED, which is the moment the design
 * calls "propose time" — before the person has decided anything. That also means
 * a proposal is recorded even if the browser never renders the card.
 *
 * WHAT IS RECORDED, AND WHERE THE LINE CURRENTLY IS.
 *
 * For `propose_changes` — the one criterion 2 names, and the only tool that
 * edits content blocks — `before` is the target page exactly as it stood when
 * the proposal was made, and `after` is what that page WOULD read if the batch
 * were accepted, computed with the same `applyProposedChanges` the accept path
 * uses. That is a genuine diff: the registry facets can re-render it on a record
 * page long after the call is gone.
 *
 * For the other six proposal tools this records the CALL, not a snapshot:
 * `after` is the tool's arguments and `before` is null. For `create_page` that
 * is already right (a create has no before). For `define_schema`, `add_row`,
 * `promote_table`, `configure_view` and `link_records` it is HONESTLY PARTIAL —
 * their before/after live in the page's property schema and rows, not its
 * blocks, and snapshotting those is the downstream diff-flow work #110's
 * Delivered-by table assigns beyond this issue. Until then, a record page for
 * one of those six can show what was asked for but not what it would replace.
 *
 * The ids minted for CREATED blocks here are provisional: the client mints its
 * own on accept, so a created block's id in `after` need not be the id that
 * finally lands. The shape, order and content are what the record is for.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { applyProposedChanges } from '@/lib/pages/edits'
import { advanceStatus, appendProposal, getRecordByToolCall, reviseRecord } from './store'
import { canRevise, isOpen } from './status'
import { ACTOR_YOU, type ChangeLogAction, type ChangeLogRecord } from './types'

/**
 * Tool name → the action its record is filed under. A tool that is NOT in here
 * is not a proposal — `read_page`, `fetch_context`, `web_search`,
 * `ask_question` and `suggest_followups` change nothing, so they log nothing.
 */
const PROPOSAL_ACTIONS: Readonly<Record<string, ChangeLogAction>> = {
  propose_changes: 'edit',
  create_page: 'create_page',
  define_schema: 'define_schema',
  add_row: 'add_row',
  promote_table: 'promote_table',
  configure_view: 'configure_view',
  link_records: 'link_records',
}

/** The slice of an emitted tool call this module needs. */
export interface ProposalToolCall {
  toolCallId: string
  toolName: string
  input: unknown
}

export interface RecordProposalsInput {
  userId: string
  /**
   * #312: the pond the proposal belongs to. `s6m5` — the change log is per pond.
   * A record written without one escapes every pond filter, so it would appear in
   * the proposed view of every pond.
   */
  pondId: string | null
  /** The page the person has open — the default target of a block proposal. */
  openPageId: string | null
  /** The conversation the proposal came from, when the caller knows it. */
  sourceThreadId?: string | null
  /**
   * #98 — this turn answers a request-changes note (or a revise on an outdated
   * card) on the propose_changes call with this id. The propose_changes this
   * turn emits is then recorded through `reviseRecord`, linked to the original
   * via `links.revisedFrom`, instead of as an unrelated proposal.
   */
  revisesToolCallId?: string | null
  toolCalls: ProposalToolCall[]
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

/** The page a call applies to: the one it named, else the one that is open. */
function targetPageOf(toolName: string, input: unknown, openPageId: string | null): string | null {
  const args = asRecord(input)
  // propose_changes names a cross-page target as `targetPageId` (ticket-30); the
  // collection tools name theirs `pageId`. A create has no target page yet.
  if (toolName === 'create_page') return null
  for (const key of ['targetPageId', 'pageId']) {
    const v = args[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return openPageId
}

/** The target page's blocks as they stand right now, or null if unreadable. */
async function loadBlocks(
  supabase: SupabaseClient<Database>,
  pageId: string
): Promise<Block[] | null> {
  const { data } = await supabase.from('pages').select('blocks').eq('id', pageId).maybeSingle()
  const blocks = (data as { blocks?: unknown } | null)?.blocks
  return Array.isArray(blocks) ? (blocks as Block[]) : null
}

/**
 * Insert one `proposed` record per proposal tool call in a step. Returns how
 * many were written.
 *
 * Never throws. The change log is a side-record of the turn: if it cannot be
 * written, the person still gets their reply. A dropped record is a bug worth
 * finding in the logs; a 500 in its place is a worse one.
 */
export async function recordProposedToolCalls(
  supabase: SupabaseClient<Database>,
  input: RecordProposalsInput
): Promise<number> {
  const {
    userId,
    pondId = null,
    openPageId,
    sourceThreadId = null,
    revisesToolCallId = null,
    toolCalls,
  } = input
  let written = 0
  // The record a revision answers, resolved once per turn (#98). Null when there
  // is nothing to link — the revision is then recorded as a plain proposal.
  let revised: ChangeLogRecord | null = null
  if (revisesToolCallId) {
    try {
      revised = await getRecordByToolCall(supabase, {
        userId,
        pondId,
        toolCallId: revisesToolCallId,
      })
      // The note IS the decision: if the browser's own advance has not landed
      // yet, land it here, so the original never sits `proposed` beside its
      // revision. Idempotent against the client's advance via `isOpen`.
      if (revised && isOpen(revised.status)) {
        revised = await advanceStatus(supabase, revised.id, 'changes_requested', ACTOR_YOU)
      }
      if (revised && !canRevise(revised.status)) revised = null
    } catch (err) {
      console.error(
        '[change-log] could not resolve the record a revision answers',
        revisesToolCallId,
        err
      )
      revised = null
    }
  }

  for (const call of toolCalls) {
    const action = PROPOSAL_ACTIONS[call.toolName]
    if (!action) continue

    try {
      const targetPageId = targetPageOf(call.toolName, call.input, openPageId)
      let before: unknown = null
      let after: unknown = asRecord(call.input)

      if (call.toolName === 'propose_changes') {
        // A block proposal with nowhere to land is not a proposal — the accept
        // path would count every change as skipped. Don't log a homeless record.
        if (!targetPageId) continue
        const blocks = await loadBlocks(supabase, targetPageId)
        if (blocks === null) continue
        const changes = (asRecord(call.input).changes ?? []) as ModuleChange[]
        before = blocks
        after = applyProposedChanges(blocks, changes, () => crypto.randomUUID(), {
          batch: changes,
        }).blocks
      }

      const record = {
        userId,
        pondId,
        action,
        targetPageId,
        before,
        after,
        sourceThreadId,
        toolCallId: call.toolCallId,
      }
      // Only a propose_changes revises a propose_changes; anything else emitted
      // in the same turn is its own proposal.
      if (revised && call.toolName === 'propose_changes') {
        await reviseRecord(supabase, revised, record)
        revised = null
      } else {
        await appendProposal(supabase, record)
      }
      written++
    } catch (err) {
      // Deliberately swallowed — see the contract above.
      console.error('[change-log] failed to record proposal', call.toolName, err)
    }
  }

  return written
}
