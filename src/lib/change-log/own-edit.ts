/**
 * G2, the other half (#98): "if a diff's target is edited after the diff is
 * made, the diff goes outdated."
 *
 * The accept path sweeps a page's other block diffs when a diff LANDS
 * (`commitAcceptedEdit`). This is the sweep for the person's OWN typed edit: the
 * editor's debounced save commits the whole block array, so every pending block
 * diff aimed at that page was written against a state that no longer exists.
 * The card then learns of it through `listRecordsByToolCalls` and greys out,
 * loses accept and offers revise.
 *
 * A side-record of the save, never a precondition for it: the blocks have
 * already landed when this runs, so nothing here may throw.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { markOutdated } from './store'
import { ACTOR_YOU, BLOCK_ACTIONS } from './types'

export async function sweepOutdatedAfterOwnEdit(
  supabase: SupabaseClient<Database>,
  opts: { workspace: WorkspaceScope; pageId: string }
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // No session: there is no pond to scope a sweep to.
    if (!user) return
    await markOutdated(supabase, {
      userId: user.id,
      workspace: opts.workspace,
      targetPageId: opts.pageId,
      // Whole page — the save wrote the whole array. Block actions only: a
      // pending add_row on this page is untouched by a block write.
      actions: [...BLOCK_ACTIONS],
      actor: ACTOR_YOU,
    })
  } catch (err) {
    console.error('[change-log] outdated sweep after own edit failed', opts.pageId, err)
  }
}
