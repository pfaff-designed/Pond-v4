/**
 * What the change log owes a person's own edit.
 *
 * 1. THE RECORD. Your own edits are accepted as you make them: every pause
 *    leaves one record, born `accepted`, by you, carrying the before and after.
 *    The caller decides what a pause is (the editor's debounced save, `pause.ts`
 *    for record edits); this records what it is handed, and nothing when the
 *    two sides are equal.
 *
 * 2. THE SWEEP. If a diff's target is edited after the diff is made, the diff
 *    goes outdated. The accept path sweeps a page's other block diffs when a
 *    diff LANDS (`commitAcceptedEdit`); this is the sweep for the person's OWN
 *    typed edit. The card then learns of it through `listRecordsByToolCalls`
 *    and greys out, loses accept and offers revise.
 *
 *    SCOPED TO THE BLOCKS, NOT THE SAVE. The debounced save writes the whole
 *    page — title included — so a rename reaches here with byte-identical
 *    blocks. `outdated` is one-way (it drops accept), so sweeping on the save
 *    alone would destroy every pending diff on a page the moment its title was
 *    touched. The blocks that just landed are therefore passed through to
 *    `markOutdated`, which leaves a record whose `before` still equals them
 *    alone.
 *
 * Both are side-records of a write that has already landed, so nothing here may
 * throw: a failure is logged to the console and the save stands. The sweep is
 * awaited — the card's reconcile must not read the log before it — but the
 * record is not: the save is done once the blocks and the sweep are, and a slow
 * append must not hold the editor at "saving".
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { jsonEqual } from '@/lib/json-equal'
import { appendOwnEdit, markOutdated, type AppendRecordInput } from './store'
import { ACTOR_YOU, BLOCK_ACTIONS, type RowSnapshot } from './types'

/** The signed-in person, or null — never a throw. */
const sessionUserId = async (
  supabase: SupabaseClient<Database>,
  where: string
): Promise<string | null> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch (err) {
    console.error('[change-log] no session for own edit', where, err)
    return null
  }
}

const appendUnlessUnchanged = async (
  supabase: SupabaseClient<Database>,
  input: Omit<AppendRecordInput, 'status' | 'actor'>
): Promise<void> => {
  if (jsonEqual(input.before ?? null, input.after ?? null)) return
  try {
    await appendOwnEdit(supabase, input)
  } catch (err) {
    console.error('[change-log] own edit not logged', input.targetPageId, err)
  }
}

/** The own-edit record of one save, still being written. Settles, never rejects. */
export interface OwnEditLogging {
  logged: Promise<void>
}

/**
 * After the editor's save has landed: sweep the page's pending block diffs, then
 * start logging the save as one accepted record. Resolves once the sweep is done;
 * `logged` settles once the record is in. One session lookup serves both.
 */
export async function recordOwnEdit(
  supabase: SupabaseClient<Database>,
  opts: {
    /** The pond whose log is swept and written. */
    pondId?: string | null
    pageId: string
    /** The blocks as they stood before this pause — what the page last saved. */
    before: Block[]
    /** The blocks the save just wrote. A pending diff whose `before` still
     *  matches them is untouched — the page's blocks did not move. */
    blocks: Block[]
  }
): Promise<OwnEditLogging> {
  const userId = await sessionUserId(supabase, opts.pageId)
  // No session: there is no pond to sweep or log into.
  if (!userId) return { logged: Promise.resolve() }

  try {
    await markOutdated(supabase, {
      userId,
      pondId: opts.pondId,
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

  const logged = appendUnlessUnchanged(supabase, {
    userId,
    pondId: opts.pondId,
    action: 'edit',
    targetPageId: opts.pageId,
    before: opts.before,
    after: opts.blocks,
  })
  return { logged }
}

/**
 * Log one pause of edits to a collection's record. Filed against the collection
 * page — the log's "page" column reads `recipes` for "added chickpeas, harissa".
 * A null `before` means the pause began by creating the row.
 */
export async function recordOwnRowEdit(
  supabase: SupabaseClient<Database>,
  opts: {
    pondId?: string | null
    collectionId: string
    before: RowSnapshot | null
    after: RowSnapshot
  }
): Promise<void> {
  const userId = await sessionUserId(supabase, opts.collectionId)
  if (!userId) return
  await appendUnlessUnchanged(supabase, {
    userId,
    pondId: opts.pondId,
    action: opts.before === null ? 'add_row' : 'edit_row',
    targetPageId: opts.collectionId,
    before: opts.before,
    after: opts.after,
  })
}
