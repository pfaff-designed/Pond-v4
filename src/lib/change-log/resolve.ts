/**
 * Resolving a proposal card into the change log (issue #146 item 1, spec #110 §4).
 *
 * `propose.ts` writes the record when the call is EMITTED; this is the other end
 * of that arc — the person decides, and the record advances off `proposed`.
 * Without it every record stays `proposed` forever, which makes the log's own
 * headline figure ("N proposed, waiting on you") count proposals already settled.
 *
 * WHAT LANDS HERE, AND WHAT DOES NOT. An accepted BLOCK edit must commit the page
 * and advance the record in one transaction (criterion 3), so `propose_changes`
 * accepts go through `writeAcceptedChanges` → `acceptRecord` instead. Everything
 * else comes here: a reject on any card, and an accept on the six tools whose
 * write lands in a page's property schema or rows rather than its blocks.
 *
 * HONEST LIMIT — criterion 3's atomicity is narrower than "propose_changes". Only
 * a block accept whose record still names the page being written gets the shared
 * transaction. Three cases do not:
 *
 *   1. the six non-block tools, which write first and then advance through
 *      `resolveChangeLogRecord`, which swallows its own failures;
 *   2. a RETARGETED block accept, where the record's frozen `target_page_id`
 *      disagrees with the page the person chose (#146 item 5) — it commits, then
 *      advances separately;
 *   3. a mixed batch whose first change was rejected, which leaves a committed
 *      block beside a `rejected` record.
 *
 * In each, a dropped advance leaves a committed write beside a record that does
 * not say so — the shape criterion 3 forbids — and (1) inflates the log's "N
 * proposed, waiting on you" figure. Closing (1) needs a commit-and-advance
 * function per tool, the way `accept_change_log_record` is one for block edits.
 * None of that is built, and none of it is this issue's scope.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { ProposalDecision } from '@/lib/conversation/resolutions'
import { isOpen } from './status'
import { acceptRecord, advanceStatus, getRecordByToolCall, markOutdated } from './store'
import { ACTOR_YOU, BLOCK_ACTIONS, type ChangeLogRecord, type ChangeLogStatus } from './types'

export interface ResolveRecordInput {
  userId: string
  /** #312: which pond's log. A tool call id is unique per pond, not globally. */
  pondId: string | null
  /** The tool call whose card the person just decided. */
  toolCallId: string
  /** The decision, which is also the status the record lands on — the card's own
   *  decision type, since the two must never drift. */
  decision: ProposalDecision
}

/**
 * Advance the record behind one resolved card. Returns the advanced record, or
 * null when there was nothing to advance.
 */
export async function resolveChangeLogRecord(
  supabase: SupabaseClient<Database>,
  opts: ResolveRecordInput
): Promise<ChangeLogRecord | null> {
  // Never throws, for the same reason `recordProposedToolCalls` never does: this
  // runs AFTER the card has resolved optimistically, so there is nothing left for
  // an exception to protect — it would only surface as an unhandled rejection in
  // a floating promise. A dropped advance is a bug worth finding in the logs.
  try {
    const record = await getRecordByToolCall(supabase, {
      userId: opts.userId,
      pondId: opts.pondId,
      toolCallId: opts.toolCallId,
    })
    if (!record) return null
    // Resolving the same card twice is ordinary, not a bug: propose_changes
    // dispatches one `resolve` per change index and again to carry the skip counts.
    // Only a still-open record has anywhere to go — and the state machine calls
    // accepted → accepted illegal, so re-advancing would throw on a decision the
    // person already made.
    if (!isOpen(record.status)) return null
    return await advanceStatus(supabase, record.id, opts.decision, ACTOR_YOU)
  } catch (err) {
    console.error('[change-log] failed to resolve record for call', opts.toolCallId, err)
    return null
  }
}

// ── The accept side ──────────────────────────────────────────────────────────
//
// The accept path asks two questions and this module answers both, so the rules
// about a record's status live next to the record and not in lib/pages.

/**
 * The statuses that refuse the page write, and what to tell the person.
 *
 * A REFUSE-LIST, not `!== 'proposed'`, because most settled statuses must still
 * write. The log holds one record per tool call while the card decides PER
 * CHANGE: rejecting the first change of a batch leaves the record `rejected`
 * while its other changes are still live, and the second click of a split accept
 * finds the record its own first click advanced. So `proposed`, `accepted` and
 * `rejected` all write; the status records the batch's first decision, and is not
 * permission to write.
 *
 * `outdated` is the one criterion 5 names — "its accept affordance is withdrawn
 * while revise is offered". The rest are here because re-applying them is plainly
 * wrong, and because they are about to become reachable: `undone` is stamped by
 * #104 and `reverted` by #103, and neither should be re-appliable from a stale
 * card. Listing them now costs nothing and stops those issues inheriting a trap.
 */
const REFUSES_ACCEPT: Partial<Record<ChangeLogStatus, string>> = {
  outdated: 'this proposal is out of date — ask Pond to revise it',
  withdrawn: 'this proposal was withdrawn',
  changes_requested: 'this proposal was superseded by a revision',
  undone: 'this change was undone',
  reverted: 'this change was reverted',
}

export interface ProposalForAccept {
  record: ChangeLogRecord | null
  /** Set when the log says this proposal must not be applied at all. */
  staleReason: string | null
}

/**
 * The refusal text for a status in {@link REFUSES_ACCEPT}, or null when the
 * status has none (either it writes, like `proposed`/`accepted`/`rejected`, or
 * accepting it is refused for a reason this map doesn't carry — a caller with
 * no live batch, like the proposed view's no-thread accept, decides that for
 * itself and falls back to its own text).
 *
 * Exported so the proposed view's accept-refusal path and its outdated reason
 * line read the SAME copy as this module's own refusal, rather than two
 * strings that can drift (KAN-96).
 */
export function refusalForAccept(status: ChangeLogStatus): string | null {
  return REFUSES_ACCEPT[status] ?? null
}

/**
 * What the log knows about the proposal behind an accept click, before anything
 * is written. Never throws.
 *
 * A stale reason means REFUSE. Criterion 5 withdraws the accept affordance from
 * an outdated record and offers revise instead; no card reads the log yet (#147),
 * so the button is still live, and this is what stops a diff written against a
 * page that has moved on being applied anyway — which would leave the log
 * permanently disagreeing with the page.
 */
export async function readProposalForAccept(
  supabase: SupabaseClient<Database>,
  opts: { userId: string | null; pondId: string | null; toolCallId: string }
): Promise<ProposalForAccept> {
  if (opts.userId === null) return { record: null, staleReason: null }
  let record: ChangeLogRecord | null = null
  try {
    record = await getRecordByToolCall(supabase, {
      userId: opts.userId,
      pondId: opts.pondId,
      toolCallId: opts.toolCallId,
    })
  } catch (err) {
    // Refusing here would be safe — nothing is written yet — but it would also
    // decline an edit the person accepted because a side-record query was
    // unavailable. The edit wins; the log takes the loss, loudly.
    console.error('[change-log] could not read the record for call', opts.toolCallId, err)
    return { record: null, staleReason: null }
  }
  if (record === null) return { record: null, staleReason: null }
  const refusal = REFUSES_ACCEPT[record.status]
  return refusal === undefined ? { record, staleReason: null } : { record, staleReason: refusal }
}

export interface CommitAcceptedEditInput {
  userId: string | null
  /** #312: the pond whose log is advanced and swept. */
  pondId: string | null
  /** The record behind this accept, from {@link readProposalForAccept}. */
  record: ChangeLogRecord | null
  /** The page actually being written — the one the PERSON chose. */
  targetPageId: string
  blocks: unknown
  /** Commit the blocks the ordinary way, when the log cannot do it atomically. */
  commit: () => Promise<void>
  /** Propagate a write the RPC made itself: rail refresh + re-embed. */
  propagate: () => Promise<void>
}

/**
 * Write an accepted block edit and move its record in step, then sweep the page.
 *
 * Call this ONLY when something actually landed. An all-skipped accept leaves the
 * page's blocks unchanged, and stamping `accepted` on a diff that was never
 * applied would break criterion 3 ("never an accepted record without the
 * committed block") — permanently, because the log only grows.
 */
export async function commitAcceptedEdit(
  supabase: SupabaseClient<Database>,
  opts: CommitAcceptedEditInput
): Promise<void> {
  const { userId, pondId, record, targetPageId, blocks, commit, propagate } = opts

  // The atomic path, and the only one criterion 3 is satisfied by: the page write
  // rides inside accept_change_log_record. It is available only when the record is
  // still open AND names the page being written — the person can retarget an
  // accept (ticket-30) while `target_page_id` is frozen at propose time, and the
  // RPC commits to the RECORD's page, so on a disagreement it would write a page
  // they had redirected away from.
  if (record !== null && isOpen(record.status) && record.targetPageId === targetPageId) {
    let committed = false
    try {
      await acceptRecord(supabase, record.id, blocks)
      committed = true
    } catch (err) {
      // All-or-nothing, so nothing was written — most likely the record was swept
      // `outdated` between the read and here. The edit still has to land.
      console.error('[change-log] atomic accept failed; committing without it', record.id, err)
      await commit()
    }
    if (committed) {
      // The RPC wrote pages.blocks and nothing else, so the rail refresh and the
      // re-embed still owe. Deliberately OUTSIDE the try above: in it, a
      // propagation failure fell through to `commit()` and re-saved the blocks the
      // RPC had just written — and if that re-save threw, the error escaped after
      // the page had already changed.
      try {
        await propagate()
      } catch (err) {
        console.error('[change-log] propagation after accept failed', targetPageId, err)
      }
    }
  } else {
    await commit()
    if (record !== null && isOpen(record.status)) {
      // Retargeted (#146 item 5): committed to the page the person chose, so the
      // record advances on its own and goes on naming a page nothing was written
      // to. Guarded, because the blocks are already in — letting this escape would
      // report a failed accept for an edit that is on the page, and re-arm the
      // card over a decision the person already made.
      try {
        await advanceStatus(supabase, record.id, 'accepted', ACTOR_YOU)
      } catch (err) {
        console.error('[change-log] could not advance record after commit', record.id, err)
      }
    }
  }

  // G2 (criterion 5): the page moved on, so the other BLOCK diffs aimed at it were
  // written against a state that no longer exists. Scoped to the block actions —
  // a pending `add_row` on this page is untouched by a block write and stays
  // perfectly applicable, but a pending `revert` (#103) is a block diff exactly
  // like an edit and goes stale with them.
  //
  // Guarded for the same reason as above: this runs after the blocks have landed.
  if (userId !== null) {
    try {
      await markOutdated(supabase, {
        userId,
        pondId,
        targetPageId,
        exceptId: record?.id,
        actions: [...BLOCK_ACTIONS],
      })
    } catch (err) {
      console.error('[change-log] outdated sweep failed for page', targetPageId, err)
    }
  }
}
