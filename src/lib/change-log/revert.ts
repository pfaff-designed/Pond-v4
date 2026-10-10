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
import { advanceStatus, appendRecord, listRevertsOf, mapChangeLogRow, markOutdated } from './store'
import { isOpen } from './status'
import { jsonEqual } from '@/lib/json-equal'
import { planRevert, readBlockSnapshot, revertRefusal } from './revert-plan'
import { ACTOR_YOU, BLOCK_ACTIONS, type ChangeLogRecord, type ChangeLogRow } from './types'

// ── Store calls ──────────────────────────────────────────────────────────────

export interface ProposeRevertInput {
  userId: string
  /**
   * #312: the pond this revert belongs to. Without it the record is written
   * pond-less: `PageChangesPanel` now reads scoped, so the card NEVER APPEARS —
   * while `listRevertsOf` still finds it, so the second attempt throws "already
   * has a revert waiting on you". The log only grows, so the page becomes
   * permanently unrevertable with nothing on screen to explain it.
   */
  pondId: string | null
  /** The accepted record being set back. */
  record: ChangeLogRecord
  /** The target page's blocks as they stand now. */
  current: Block[]
}

/**
 * Raise a revert: ONE new record, `action: 'revert'`, linked back through
 * `links.revertOf`. The original is not touched — "revert doesn't rewrite history".
 *
 * The new record's `before` is the page as it stands now and its `after` is what
 * the page will read once it lands — an ordinary diff in exactly the shape
 * `propose.ts` writes for an edit, so it renders through the same registry facets
 * and is answered through the same affordance.
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
  const refusal = revertRefusal(record)
  if (refusal !== null) {
    throw new Error(`change log: record ${record.id} cannot be reverted — ${refusal}`)
  }

  const existing = await listRevertsOf(supabase, {
    userId,
    pondId: input.pondId,
    recordId: record.id,
  })
  if (existing.some((r) => r.status === 'proposed')) {
    throw new Error(`change log: record ${record.id} already has a revert waiting on you`)
  }
  // An `outdated` revert raised against this very page state would be raised
  // again, identically, for as long as the person keeps clicking — and the log
  // only grows, so each click is permanent. Refuse until something actually
  // changes; then the answer can differ and a fresh attempt is worth recording.
  if (
    existing.some((r) => r.status === 'outdated' && jsonEqual(readBlockSnapshot(r.before), current))
  ) {
    throw new Error(`change log: this change could not be set back against the page as it stands`)
  }

  const plan = planRevert(record, current)
  return appendRecord(supabase, {
    userId,
    pondId: input.pondId,
    status: plan.status,
    action: 'revert',
    // `you` on a `proposed` record, which nothing else in the log produces. It is
    // right: the person RAISES a revert, and "revert goes through accept like any
    // change" — the storyboard draws accept/reject on it. #110 criterion 7's
    // "own edits land accepted" is about typing on a page, not about proposing.
    actor: ACTOR_YOU,
    targetPageId: record.targetPageId,
    targetBlockId: record.targetBlockId,
    // Whole-page snapshots, the same shape `propose.ts` writes for an `edit` — so
    // #147's record page has ONE thing to render, and so the delete-restore anchor
    // in `planRevert` has real neighbours to aim at when this record is itself
    // reverted. `after` is exactly what accept will write: accept does NOT re-plan
    // (see `acceptRevert`), so the record can never describe a page that was not.
    before: current,
    // NULL when the plan is unsound. An outdated revert can never be accepted, so
    // its `after` is speculative — and a plan built over a block that moved on can
    // be actively wrong: probed, it marked an unrelated look-alike for deletion.
    // 0011 freezes `after`, and #147 renders before/after uniformly, so persisting
    // that array would show the person a diff deleting a block of theirs that
    // nothing was ever going to delete. Absent beats fabricated.
    after: plan.movedOn ? null : plan.blocks,
    // NOT the original's thread. A revert raised by clicking a button did not come
    // from the conversation that produced the change it takes back, and #110 calls
    // this "the transcript ↔ log link". Claiming one would be a false provenance
    // chip on #147's record page, which is exactly what its blocker 1 says to avoid.
    sourceThreadId: null,
    links: { revertOf: record.id },
  })
}

/** What accepting a revert did. `outdated` is an ordinary outcome, not a failure. */
export type AcceptRevertResult =
  | { kind: 'accepted'; revert: ChangeLogRecord }
  /** The page moved after this revert was raised — accept is withdrawn and the
   *  record has been advanced to `outdated`. Raise a fresh revert of the original;
   *  it re-plans against the page as it now stands. */
  | { kind: 'outdated'; revert: ChangeLogRecord }

export interface AcceptRevertInput {
  userId: string
  /**
   * #312: the pond this revert belongs to. Without it the record is written
   * pond-less: `PageChangesPanel` now reads scoped, so the card NEVER APPEARS —
   * while `listRevertsOf` still finds it, so the second attempt throws "already
   * has a revert waiting on you". The log only grows, so the page becomes
   * permanently unrevertable with nothing on screen to explain it.
   */
  pondId: string | null
  /** The `proposed` revert record being answered. */
  revert: ChangeLogRecord
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
 * WHAT IS WRITTEN IS THE RECORD'S OWN `after`, NOT A FRESH PLAN. An earlier build
 * re-planned here so that unrelated edits made between raising and answering would
 * survive — and it worked, but it meant the page was set to something the record
 * did not describe, permanently, because 0011 freezes `after`. The invariant is
 * worth more than the convenience: a revert writes exactly what it says it writes.
 *
 * So the page must be as it was when the revert was planned. When it is not, the
 * revert goes `outdated` and nothing is written — "accept is not offered; revise
 * is offered" (criterion 5). Raising it again re-plans against the page as it then
 * stands, which preserves whatever landed in between; the cost is one more click,
 * and the gain is a log that never lies. The RPC repeats the comparison under its
 * row lock, so a page that moves between this check and the transaction is caught
 * there rather than clobbered.
 */
export async function acceptRevert(
  supabase: SupabaseClient<Database>,
  input: AcceptRevertInput
): Promise<AcceptRevertResult> {
  const { revert, current } = input
  const actor = input.actor ?? ACTOR_YOU

  // Already settled — swept `outdated` by another accept, or answered in another
  // tab — so there is nothing to advance. `advanceStatus` would raise
  // IllegalTransitionError on `outdated → outdated`, which reached the person as a
  // crash instead of the ordinary "this is out of date".
  if (!isOpen(revert.status)) return { kind: 'outdated', revert }

  const planned = readBlockSnapshot(revert.before)
  if (planned === null || !jsonEqual(current, planned)) {
    const advanced = await advanceStatus(supabase, revert.id, 'outdated', actor)
    return { kind: 'outdated', revert: advanced }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('accept_revert_record', {
    p_record_id: revert.id,
    p_blocks: revert.after,
    p_expected: revert.before,
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
        pondId: input.pondId,
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
