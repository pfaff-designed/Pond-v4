/**
 * KAN-479: move one block from `sourcePageId` to the end of `targetPageId` —
 * the block menu's `move to…`. A plain lib function, no React, so the
 * decoupled block-pick request (`ShellCommands`) can land it without going
 * through whichever `BlockCanvas` happens to be mounted for the source page.
 *
 * The target write lands FIRST, exactly as written here: a failed target
 * write (network, RLS) must leave the source page untouched, so nothing is
 * removed from the source until the append has actually landed. Both sides
 * write through `commitBlocks`'s own-edit branch, same as
 * `child-links.ts`'s `appendChildLinkToParent` — each leaves its own
 * change-log record, and the two are reported back as ONE history step
 * (`recordIds`, source first) so a caller can hand them to `sessionUndo` as
 * a single ⌘Z.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import { getPage } from './client'
import { commitBlocks } from './commit'
import { flushPendingPageSave } from './page-flush'

/** One move per block at a time — a second pick landing on the same block
 *  while the first move is still writing is a no-op, matching BlockCanvas's
 *  own `moveInFlightRef` guard on `moveBlockIntoNewPage`. */
const inFlight = new Set<string>()

export interface MoveBlockToPageInput {
  blockId: string
  sourcePageId: string
  targetPageId: string
  pondId: string | null
}

/** One undoable step across both pages — `recordIds` is SOURCE then TARGET,
 *  so a caller reading it back knows which half is which without re-deriving
 *  it from the ids themselves. */
export interface MoveBlockResult {
  pondId: string | null
  recordIds: readonly string[]
}

/**
 * Appends the block (same id — a move, not a copy) to the end of the
 * target's blocks, then removes it from the source. Returns `null`, with no
 * write at all, when the block is no longer on the source page (a stale
 * request replayed after an earlier move already landed) or either page is
 * gone — there is nothing to undo either way.
 */
export async function moveBlockToPage(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  { blockId, sourcePageId, targetPageId, pondId }: MoveBlockToPageInput
): Promise<MoveBlockResult | null> {
  if (inFlight.has(blockId)) return null
  inFlight.add(blockId)
  try {
    await Promise.all([flushPendingPageSave(sourcePageId), flushPendingPageSave(targetPageId)])

    const source = await getPage(supabase, sourcePageId)
    const block = source?.blocks.find((b) => b.id === blockId)
    if (!source || !block) return null

    const target = await getPage(supabase, targetPageId)
    if (!target) return null

    // Appended first: if this throws (the write never lands), the source
    // removal below never runs — the source page is left exactly as it was.
    let targetRecordId: string | null = null
    const { remembered: targetRemembered } = await commitBlocks(
      supabase,
      queryClient,
      targetPageId,
      [...target.blocks, block],
      {
        ownEdit: true,
        before: target.blocks,
        pondId,
        onPending: (ids) => {
          targetRecordId = ids?.[0] ?? null
        },
      }
    )
    await targetRemembered
    await queryClient.invalidateQueries({ queryKey: ['page', targetPageId] })

    let sourceRecordId: string | null = null
    const { remembered: sourceRemembered } = await commitBlocks(
      supabase,
      queryClient,
      sourcePageId,
      source.blocks.filter((b) => b.id !== blockId),
      {
        ownEdit: true,
        before: source.blocks,
        pondId,
        onPending: (ids) => {
          sourceRecordId = ids?.[0] ?? null
        },
      }
    )
    await sourceRemembered
    await queryClient.invalidateQueries({ queryKey: ['page', sourcePageId] })

    // Read after both `remembered` promises settle, so each `onPending`
    // closure has already run — cast past TS's control-flow narrowing
    // (it can't see a write inside a callback it doesn't trace) rather than
    // widening the declared `string | null` with a cast at every read.
    const ids = [sourceRecordId, targetRecordId] as (string | null)[]
    return { pondId, recordIds: ids.filter((id): id is string => id !== null) }
  } finally {
    inFlight.delete(blockId)
  }
}
