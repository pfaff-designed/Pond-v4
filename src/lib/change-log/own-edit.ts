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
 * SCOPED TO THE BLOCKS, NOT THE SAVE (#98 review). The debounced save writes the
 * whole page — title included — so a rename reaches here with byte-identical
 * blocks. `outdated` is one-way (it drops accept), so sweeping on the save alone
 * would destroy every pending diff on a page the moment its title was touched.
 * The blocks that just landed are therefore passed through to `markOutdated`,
 * which leaves a record whose `before` still equals them alone.
 *
 * A side-record of the save, never a precondition for it: the blocks have
 * already landed when this runs, so nothing here may throw. It IS awaited by
 * `commitBlocks` — see the note there — so the card's reconcile cannot read the
 * log before the sweep has written to it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { markOutdated } from './store'
import { ACTOR_YOU, BLOCK_ACTIONS } from './types'

export async function sweepOutdatedAfterOwnEdit(
  supabase: SupabaseClient<Database>,
  opts: {
    workspace: WorkspaceScope
    pageId: string
    /** The blocks the save just wrote. A pending diff whose `before` still
     *  matches them is untouched — the page's blocks did not move. */
    blocks: Block[]
  }
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
      pageBlocks: opts.blocks,
      actor: ACTOR_YOU,
    })
  } catch (err) {
    console.error('[change-log] outdated sweep after own edit failed', opts.pageId, err)
  }
}
