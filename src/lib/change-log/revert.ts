/**
 * Raising and answering a revert (issue #103, spec #110).
 *
 * The write side of revert. `revert-plan.ts` decides WHAT a revert would do and
 * why — including the rule that the record being reverted is untouched until the
 * revert is accepted; this module is what talks to the database.
 *
 * The `reverted by` backlink is DERIVED, never stored: migration 0011 freezes
 * `links` at insert ("adding a BACKlink to an existing record later would be a
 * deliberate migration, not an update"), so the revert carries `links.revertOf`
 * and the original is found by querying for it — {@link listRevertsOf}.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { advanceStatus, appendRecord, mapChangeLogRow, markOutdated } from './store'
import { planRevert, revertRefusal } from './revert-plan'
import { ACTOR_YOU, BLOCK_ACTIONS, type ChangeLogRecord, type ChangeLogRow } from './types'

// ── Store calls ──────────────────────────────────────────────────────────────

const TABLE = 'change_log'

const COLUMNS =
  'id, user_id, workspace, status, action, actor, target_page_id, target_block_id, before, after, source_thread_id, tool_call_id, read, links, transitions, created_at, status_at'

/**
 * The records that propose reverting `recordId` — the "reverted by" field of the
 * design's record page, and the guard against raising a second revert of the same
 * change while one is still waiting.
 *
 * Queried through `links->>revert_of` because the backlink is derived: 0011 freezes
 * `links` at insert, so the original never gains a pointer to its revert.
 */
export async function listRevertsOf(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; recordId: string }
): Promise<ChangeLogRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', opts.userId)
    .eq('workspace', opts.workspace ?? 'main')
    .eq('links->>revert_of', opts.recordId)
    .order('created_at', { ascending: false })
  // A failed query read as "no reverts yet" would let the caller raise a second
  // revert of a change that already has one waiting, and would blank the record
  // page's `reverted by` field without saying why.
  if (error) throw error
  return ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)
}

export interface ProposeRevertInput {
  userId: string
  workspace?: WorkspaceScope
  /** The accepted record being set back. */
  record: ChangeLogRecord
  /** The target page's blocks as they stand now. */
  current: Block[]
}

/**
 * Raise a revert: ONE new record, `action: 'revert'`, linked back through
 * `links.revertOf`. The original is not touched — "revert doesn't rewrite history".
 *
 * The new record's `before` is the page as it stands now and its `after` is the
 * planned result, so it is an ordinary diff that renders through the same registry
 * facets as any other and can be accepted through the same affordance.
 *
 * Raises when the record offers no revert, and when one is already waiting: a
 * second open revert of the same change would race the first, and accepting both
 * would advance the original twice — the state machine calls the second illegal,
 * so the person would meet a failure at accept time rather than at the click that
 * caused it.
 */
export async function proposeRevert(
  supabase: SupabaseClient<Database>,
  input: ProposeRevertInput
): Promise<ChangeLogRecord> {
  const { userId, record, current } = input
  const workspace = input.workspace ?? 'main'
  const refusal = revertRefusal(record)
  if (refusal !== null) {
    throw new Error(`change log: record ${record.id} cannot be reverted — ${refusal}`)
  }

  const existing = await listRevertsOf(supabase, { userId, workspace, recordId: record.id })
  if (existing.some((r) => r.status === 'proposed')) {
    throw new Error(`change log: record ${record.id} already has a revert waiting on you`)
  }

  const plan = planRevert(record, current)
  return appendRecord(supabase, {
    userId,
    workspace,
    status: plan.status,
    action: 'revert',
    // The person asked for it, so it is theirs — unlike a proposal, which is Pond's.
    actor: ACTOR_YOU,
    targetPageId: record.targetPageId,
    targetBlockId: record.targetBlockId,
    before: current,
    after: plan.blocks,
    sourceThreadId: record.sourceThreadId,
    links: { revertOf: record.id },
  })
}

/** What accepting a revert did. `outdated` is an ordinary outcome, not a failure. */
export type AcceptRevertResult =
  | { kind: 'accepted'; revert: ChangeLogRecord }
  /** The blocks moved on since the revert was raised — accept is withdrawn, revise
   *  is offered, and the revert has been advanced to `outdated`. */
  | { kind: 'outdated'; revert: ChangeLogRecord }

export interface AcceptRevertInput {
  userId: string
  workspace?: WorkspaceScope
  /** The `proposed` revert record being answered. */
  revert: ChangeLogRecord
  /** The record it reverts — `links.revertOf`, still `accepted`. */
  original: ChangeLogRecord
  /** The target page's blocks as they stand NOW. */
  current: Block[]
  actor?: string
}

/**
 * Accept a revert: commit the page, advance the revert to `accepted`, and advance
 * the record it reverts `accepted → reverted` — all in ONE transaction, through
 * `accept_revert_record` (migration 0013).
 *
 * It has to be one transaction for the same reason `accept_change_log_record` does
 * (spec #110 criterion 3), with a third party to keep in step: two round-trips
 * could leave the page set back and the original still reading `accepted`, and
 * since the log only grows, that disagreement would be permanent.
 *
 * THE PLAN IS RECOMPUTED HERE, against the page as it stands now, rather than
 * writing the `after` frozen into the record at propose time. Between raising a
 * revert and answering it the page can gain unrelated edits, and replaying a stale
 * array would silently drop them. Re-planning keeps the design's promise exactly:
 * only the blocks the original touched are set back, everything else stays. If
 * those blocks are the ones that moved, `movedOn` is true and this returns
 * `outdated` without writing — "accept is not offered; revise is offered"
 * (criterion 5) — advancing the revert so the affordance goes with it.
 *
 * Raises — rolling the page write back with it — if the revert is not `proposed`,
 * if it carries no `revert_of`, if the record it reverts is no longer `accepted`,
 * or if the page changed between the plan and the transaction (the RPC's
 * compare-and-swap; the caller re-reads and tries again).
 */
export async function acceptRevert(
  supabase: SupabaseClient<Database>,
  input: AcceptRevertInput
): Promise<AcceptRevertResult> {
  const { revert, original, current } = input
  const actor = input.actor ?? ACTOR_YOU

  const plan = planRevert(original, current)
  if (plan.movedOn) {
    const advanced = await advanceStatus(supabase, revert.id, 'outdated', actor)
    return { kind: 'outdated', revert: advanced }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('accept_revert_record', {
    p_record_id: revert.id,
    p_blocks: plan.blocks,
    p_expected: current,
    p_actor: actor,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error(`change log: accept of revert ${revert.id} returned no record`)
  const accepted = mapChangeLogRow(row as ChangeLogRow)

  // The page has moved on, so every OTHER block diff aimed at it was written
  // against a state that no longer exists — the same G2 sweep an accepted edit
  // runs (criterion 5). Guarded for the same reason it is there: the blocks are
  // already in, and letting a side-record failure escape would report a failed
  // accept for a revert that has landed.
  if (revert.targetPageId !== null) {
    try {
      await markOutdated(supabase, {
        userId: input.userId,
        workspace: input.workspace ?? 'main',
        targetPageId: revert.targetPageId,
        exceptId: revert.id,
        actions: [...BLOCK_ACTIONS],
      })
    } catch (err) {
      console.error('[change-log] outdated sweep failed after revert', revert.id, err)
    }
  }
  return { kind: 'accepted', revert: accepted }
}
