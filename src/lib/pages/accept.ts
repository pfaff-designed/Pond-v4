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
}): Promise<number> {
  const { supabase, queryClient, resolutions, toolCallId, openNodeId, changes } = opts
  if (changes.length === 0) return 0

  const target = resolveAcceptTarget(resolutions, toolCallId, openNodeId)
  if (!target) return changes.length

  const page = await getPage(supabase, target)
  if (!page) return changes.length

  const result = applyProposedChanges(page.blocks, changes, () => crypto.randomUUID())
  await commitBlocks(supabase, queryClient, target, result.blocks)
  // External write to the target page — invalidate ['page', target] (not the open
  // page's key) so an open DocumentPanel on that page refetches and adopts the new
  // blocks (commitBlocks leaves that cache alone precisely so this stays the
  // caller's decision).
  await queryClient.invalidateQueries({ queryKey: ['page', target] })
  return result.skipped
}
