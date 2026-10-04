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
import { resolveAcceptTarget, type ConversationResolutions } from '@/lib/conversation/resolutions'
import { commitAcceptedEdit, readProposalForAccept } from '@/lib/change-log/resolve'
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
  pondId?: string | null
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
  if (changes.length === 0) return { applied: 0, skipped: 0, skippedReasons: [], targetId: null }

  const target = resolveAcceptTarget(resolutions, toolCallId, openNodeId)
  if (!target) {
    return {
      applied: 0,
      skipped: changes.length,
      skippedReasons: changes.map(() => 'no target page to write to'),
      targetId: null,
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
 */
const pageWriteTails = new Map<string, Promise<unknown>>()

function withPageWriteLock<T>(pageId: string, run: () => Promise<T>): Promise<T> {
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
    }
  }

  const result = applyProposedChanges(page.blocks, changes, () => crypto.randomUUID(), {
    batch,
    refIds: opts.refIds,
    rejectedKeys,
  })
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
  }

  // External write to the target page — invalidate ['page', target] (not the open
  // page's key) so an open DocumentPanel on that page refetches and adopts the new
  // blocks (commitBlocks leaves that cache alone precisely so this stays the
  // caller's decision).
  await queryClient.invalidateQueries({ queryKey: ['page', target] })
  return {
    applied: result.applied,
    skipped: result.skipped,
    skippedReasons: result.skippedReasons,
    targetId: target,
  }
}
