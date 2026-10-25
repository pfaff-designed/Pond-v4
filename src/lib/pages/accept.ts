/**
 * The propose_changes Accept write path, extracted from AITerminal so the
 * target-resolution rules are directly testable (build-brief
 * propose-changes-target, fixing BUG 1/2 of the blank-slate findings).
 *
 * An accepted batch commits to the page it was PROPOSED against — the target
 * stamped into the resolutions envelope when the part streamed in — never to
 * whatever node happens to be open at accept time. When there is nowhere safe
 * to write (no stamp + no open node, or the target page was deleted), every
 * change counts as skipped: the caller's existing skipped machinery surfaces
 * the "couldn't apply" notice and the model reads the batch as NOT applied.
 *
 * Accepts aimed at the SAME page are serialised (`withPageWriteLock`). The write
 * is a read-modify-write over the whole block array, so two in flight on one page
 * silently lose a batch — which is what "accept all" does when one message raises
 * several cards for the same page.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import { resolveAcceptTarget, type ConversationResolutions } from '@/lib/conversation/resolutions'
import { commitAcceptedEdit, readProposalForAccept, refusalForAccept } from '@/lib/change-log/resolve'
import { createDeterministicMintId } from '@/lib/change-log/mint-id'
import { changeLogKey } from '@/lib/change-log/keys'
import { advanceStatus } from '@/lib/change-log/store'
import { ACTOR_YOU, BLOCK_ACTIONS } from '@/lib/change-log/types'
import { touchedMarks } from '@/lib/change-log/accept-marks-diff'
import { recordAccept } from '@/lib/change-log/accept-marks'
import { jsonEqual } from '@/lib/json-equal'
import { splitStoredText } from '@/lib/modules/text/split-stored'
import { applyProposedChanges } from './edits'
import { getPage } from './client'
import { commitBlocks, propagateBlockWrite } from './commit'

/** The outcome of an accept write (Fix-1 / F1a+F12): honest applied/skipped
 *  counts, per-skip reasons for the card, and the target id for the receipt. */
export interface AcceptWriteResult {
  applied: number
  skipped: number
  /** One short human reason per skipped change ("couldn't place" copy). */
  skippedReasons: string[]
  /** The page id the batch committed to, or null when nothing was written. */
  targetId: string | null
  /** The change-log record this accept advanced, when it is one `sessionUndo`
   *  can later undo ({@link BLOCK_ACTIONS}) — null when nothing applied, there
   *  was no record, or the record's action is not undoable (e.g. an add_row). */
  recordId: string | null
}

export async function writeAcceptedChanges(opts: {
  supabase: SupabaseClient<Database>
  queryClient: QueryClient
  /** Whose pond this is — the scope of the change-log record being advanced.
   *  Required rather than optional on purpose: a caller that could forget it
   *  would leave the record `proposed` forever, silently. Explicitly `null` when
   *  there is no session, which means there is no pond to scope a record to. */
  userId: string | null
  /** Which pond. Scopes both the record lookup and the outdated sweep. */
  pondId: string | null
  resolutions: ConversationResolutions
  toolCallId: string
  openNodeId: string | null
  changes: ModuleChange[]
  /** The FULL proposal batch the accepted subset came from (ticket-31 same-batch
   *  bindings resolve refs against the whole batch, not just this click's subset).
   *  Defaults to `changes` when the caller has no wider batch. */
  batch?: ModuleChange[]
  /** Caller-owned bindKey→minted-id memory for this proposal, shared across
   *  per-change accept clicks so split accepts still bind (mutated). */
  refIds?: Record<string, string>
}): Promise<AcceptWriteResult> {
  const { resolutions, toolCallId, openNodeId, changes } = opts
  if (changes.length === 0) {
    return { applied: 0, skipped: 0, skippedReasons: [], targetId: null, recordId: null }
  }

  const target = resolveAcceptTarget(resolutions, toolCallId, openNodeId)
  if (!target) {
    return {
      applied: 0,
      skipped: changes.length,
      skippedReasons: changes.map(() => 'no target page to write to'),
      targetId: null,
      recordId: null,
    }
  }

  // Everything from the read to the write is one critical section per page —
  // see `withPageWriteLock`. The target has to be resolved first to know which
  // lock to take, and that resolution is pure, so nothing races ahead of it.
  return withPageWriteLock(target, () => writeToTarget(target, opts))
}

/**
 * Serialise writes per target page.
 *
 * `writeAcceptedChanges` is a read-modify-write: it reads the page, applies the
 * batch, and saves the WHOLE block array back. Two of them in flight on the same
 * page both read the pre-write state and the second `saveBlocks` overwrites the
 * first — one batch's changes vanish with no error anywhere.
 *
 * That is not hypothetical: "accept all" fires one of these per pending card,
 * and one assistant message can raise several cards aimed at the SAME page.
 * Queueing by page id makes the second accept read what the first wrote, so both
 * batches land. Different pages still go in parallel — the lock is per page, not
 * global.
 *
 * Module-level by design: the queue has to outlive any one call and be shared by
 * every caller (accept-all, a second click, two open panels), which is exactly
 * what a per-process map of tails gives. Entries are dropped once their chain
 * drains, so the map does not grow with the session.
 *
 * Exported so the proposed view's no-thread accept (`change-log/answer.ts`,
 * KAN-96) serialises against the SAME queue — a card in the proposed view and
 * a diff card in the composer can name the same page, and both are a
 * read-modify-write over its whole block array.
 */
const pageWriteTails = new Map<string, Promise<unknown>>()

export function withPageWriteLock<T>(pageId: string, run: () => Promise<T>): Promise<T> {
  const previous = pageWriteTails.get(pageId) ?? Promise.resolve()
  // `.then(run, run)` so a failed predecessor does not wedge the queue: the next
  // write still runs, it just runs after.
  const result = previous.then(run, run)
  const tail = result.then(
    () => {},
    () => {}
  )
  pageWriteTails.set(pageId, tail)
  void tail.then(() => {
    // Only the CURRENT tail may clear the slot; a later write has already
    // replaced it and owns the queue now.
    if (pageWriteTails.get(pageId) === tail) pageWriteTails.delete(pageId)
  })
  return result
}

/** The body of an accept, run under the target page's write lock. */
async function writeToTarget(
  target: string,
  opts: Parameters<typeof writeAcceptedChanges>[0]
): Promise<AcceptWriteResult> {
  const { supabase, queryClient, userId, resolutions, toolCallId, changes } = opts

  const page = await getPage(supabase, target)
  if (!page) {
    return {
      applied: 0,
      skipped: changes.length,
      skippedReasons: changes.map(() => 'the target page no longer exists'),
      targetId: null,
      recordId: null,
    }
  }

  const batch = opts.batch ?? changes
  // A bindKey whose create the user already REJECTED must not be a binding target:
  // a metric ref'ing it falls back to manual instead of dangling on an id that will
  // never land. Rejection state lives in the resolutions envelope (ticket-19),
  // keyed `${toolCallId}:${changeIndex}`.
  const rejectedKeys = new Set<string>()
  batch.forEach((change, index) => {
    if (
      change.op === 'create' &&
      change.bindKey &&
      resolutions.changes[`${toolCallId}:${index}`] === 'rejected'
    ) {
      rejectedKeys.add(change.bindKey)
    }
  })

  // What the log already knows about this proposal. A stale reason means the log
  // has moved past it — accepting anyway would write a page from a diff the system
  // has declared out of date, and the log would disagree with the page for good.
  const proposal = await readProposalForAccept(supabase, {
    userId,
    pondId: opts.pondId,
    toolCallId,
  })
  if (proposal.staleReason !== null) {
    const reason = proposal.staleReason
    return {
      applied: 0,
      skipped: changes.length,
      skippedReasons: changes.map(() => reason),
      targetId: null,
      recordId: null,
    }
  }

  // KAN-552: `propose.ts` and `assemble.ts` now read through `toBlocks`, so a
  // record's `before` is ALREADY the split shape for every diff proposed going
  // forward — `splitStoredText(before)` is then a no-op (`jsonEqual` below is
  // true) and this branch never fires for them. It is a backstop for a `before`
  // that is still raw (a record written before that read seam existed, or a
  // caller that bypasses it): nothing ever writes between propose and accept
  // here (the split is read-only), so `markOutdated`'s push-based sweep never
  // fires for this move either — splitting `before` and finding it STILL
  // matches the page as it reads now means nothing else moved, only the split
  // did, and a blockId-keyed edit would then land against just the FIRST split
  // part while the rest of the old content sits untouched beside it, a
  // duplicated page rather than a diff. Scoped to a live `proposed` record: an
  // already-`accepted`/`rejected` one is being re-processed for a later change
  // index (resolve.ts), not a first write, and an unrelated drift (a real edit
  // landed in between) already went `outdated` through that push-based sweep
  // before this record was read above.
  const record = proposal.record
  const before = record?.before
  const splitBefore = Array.isArray(before) ? splitStoredText(before as Block[]) : null
  if (
    record !== null &&
    record.status === 'proposed' &&
    BLOCK_ACTIONS.includes(record.action) &&
    splitBefore !== null &&
    !jsonEqual(before, splitBefore) &&
    jsonEqual(splitBefore, page.blocks)
  ) {
    try {
      await advanceStatus(supabase, record.id, 'outdated', ACTOR_YOU)
    } catch (err) {
      console.error('[change-log] could not mark split-stale record outdated', record.id, err)
    }
    const reason = refusalForAccept('outdated') ?? 'this proposal is out of date'
    return {
      applied: 0,
      skipped: changes.length,
      skippedReasons: changes.map(() => reason),
      targetId: null,
      recordId: null,
    }
  }

  // Same ids `propose.ts` minted into `record.after` for this toolCallId (KAN-93
  // fix) — see mint-id.ts — so a full-batch accept writes blocks byte-identical
  // to the record's snapshot, which 0021's set_back CAS requires for ⌘Z to work.
  const result = applyProposedChanges(page.blocks, changes, createDeterministicMintId(toolCallId), {
    batch,
    refIds: opts.refIds,
    rejectedKeys,
  })
  // Only an applied edit/revert is a step `sessionUndo` can later undo — an
  // add_row or a skipped-everything accept has nothing the RPC knows how to
  // set back, so remembering it would be a step that silently no-ops on ⌘Z.
  // Beyond that, 0021's set_back CAS undoes by setting the page's blocks back
  // to `record.before`, which only recovers `record.after` if what was just
  // WRITTEN is byte-identical to it — a page that drifted since propose, a
  // partial accept of a larger batch, or keyed refIds that reserved different
  // ids all write something else. Offering ⌘Z on one of those would just hand
  // the CAS a step guaranteed to refuse, so the id is withheld instead. A
  // retargeted accept (ticket-30: committed to the page the person chose, not
  // the record's frozen `target_page_id`) writes blocks to a page the CAS was
  // never scoped to either — set_back always targets `record.target_page_id`,
  // so offering this id would have ⌘Z refuse with a misleading "page changed"
  // forever instead of a clean "can't undo this one".
  const recordId =
    result.applied > 0 &&
    proposal.record !== null &&
    proposal.record.targetPageId === target &&
    BLOCK_ACTIONS.includes(proposal.record.action) &&
    // `result.blocks` can carry an own `width: undefined` key (edits.ts preserves
    // the target's width unconditionally); jsonb strips undefined-valued keys on
    // write, so `proposal.record.after` never has it. Round-trip through JSON
    // first so the comparison sees what commitBlocks/the RPC actually store.
    jsonEqual(JSON.parse(JSON.stringify(result.blocks)), proposal.record.after)
      ? proposal.record.id
      : null
  if (result.applied === 0) {
    // Nothing landed, so the page has not moved on and the log must not say it
    // has. The blocks are unchanged; committing them is what this path did before
    // the log existed, and it keeps the receipt and skip reasons intact.
    await commitBlocks(supabase, queryClient, target, result.blocks)
  } else {
    await commitAcceptedEdit(supabase, {
      userId,
      pondId: opts.pondId,
      record: proposal.record,
      targetPageId: target,
      blocks: result.blocks,
      commit: () => commitBlocks(supabase, queryClient, target, result.blocks),
      propagate: () => propagateBlockWrite(queryClient, target),
    })
    // The mark is a session UI cue, not a record of what the RPC stored — it
    // keys off recordId (nullable) rather than the undoable gate above, since
    // "changed HH:MM" applies to every landed accept, undoable or not.
    const marks = touchedMarks(page.blocks, result.blocks)
    if (marks.length > 0) recordAccept(target, marks, recordId, new Date().toISOString())
  }

  // External write to the target page — invalidate ['page', target] (not the open
  // page's key) so an open DocumentPanel on that page refetches and adopts the new
  // blocks (commitBlocks leaves that cache alone precisely so this stays the
  // caller's decision).
  await queryClient.invalidateQueries({ queryKey: ['page', target] })
  // The record above may have advanced (or, in the all-skipped branch, stayed put)
  // — either way the write this function was called to do has resolved, so the
  // change log's count/list queries must refetch rather than sit on their 30s
  // staleTime (KAN-316).
  await queryClient.invalidateQueries({ queryKey: changeLogKey() })
  return {
    applied: result.applied,
    skipped: result.skipped,
    skippedReasons: result.skippedReasons,
    targetId: target,
    recordId,
  }
}
