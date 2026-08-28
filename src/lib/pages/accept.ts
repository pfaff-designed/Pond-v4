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
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { resolveAcceptTarget, type ConversationResolutions } from '@/lib/conversation/resolutions'
import { applyProposedChanges } from './edits'
import { getPage } from './client'
import { commitBlocks } from './commit'

export async function writeAcceptedChanges(opts: {
  supabase: SupabaseClient<Database>
  queryClient: QueryClient
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
}): Promise<number> {
  const { supabase, queryClient, resolutions, toolCallId, openNodeId, changes } = opts
  if (changes.length === 0) return 0

  const target = resolveAcceptTarget(resolutions, toolCallId, openNodeId)
  if (!target) return changes.length

  const page = await getPage(supabase, target)
  if (!page) return changes.length

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

  const result = applyProposedChanges(page.blocks, changes, () => crypto.randomUUID(), {
    batch,
    refIds: opts.refIds,
    rejectedKeys,
  })
  await commitBlocks(supabase, queryClient, target, result.blocks)
  // External write to the target page — invalidate ['page', target] (not the open
  // page's key) so an open DocumentPanel on that page refetches and adopts the new
  // blocks (commitBlocks leaves that cache alone precisely so this stays the
  // caller's decision).
  await queryClient.invalidateQueries({ queryKey: ['page', target] })
  return result.skipped
}
