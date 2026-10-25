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
 *
 * The undo slot is reserved (`sessionUndo.rememberPending`, KAN-368's
 * pattern) BEFORE the target write even starts, with a deferred that
 * resolves once both record ids are known or the move can't be undone —
 * never after both writes land, or a ⌘Z pressed mid-move would fall through
 * to whatever step sits underneath this one. A target write that lands
 * followed by a source write that throws is compensated: the target is
 * written back to its pre-move blocks, so the block is never left on both
 * pages with nothing undoable.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { detachKeepingRows } from '@/lib/modules/layout-rows'
import { sessionUndo, type UndoHandle } from '@/lib/change-log/session-undo'
import { changeLogKey } from '@/lib/change-log/keys'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import type { StageUndoInput } from '@/lib/deletion/useDeletionUndo'
import { getPage } from './client'
import { commitBlocks } from './commit'
import { flushPendingPageSave } from './page-flush'

/** The pure half of a move: `source` with `blockId` removed through
 *  `detachKeepingRows` (KAN-440) — a leader handing over `rowStart` keeps
 *  the row below intact — and `target` with a `rowStart`- and `width`-
 *  stripped copy appended. A block's row was a fact about the page it's
 *  leaving; on the target it lands full width on its own line at the end,
 *  the same reason `moveIntoPagePrep` (conversions.ts) drops `rowStart` for
 *  a block moving into a new page. `null` when `blockId` isn't on `source`,
 *  or `target` already holds it (a stale retry — the caller crashes on
 *  this, not this planner). */
export interface BlockMovePlan<T> {
  source: T[]
  target: T[]
}

/** Drops `width` and `rowStart` from a layout snapshot without binding them
 *  as unused destructured locals (ESLint's `no-unused-vars` here has no
 *  underscore allowance to lean on instead). */
function withoutLayout<T extends { width?: Block['width']; rowStart?: boolean }>(block: T): T {
  const copy: T = { ...block }
  delete copy.width
  delete copy.rowStart
  return copy
}

export function planBlockMove<
  T extends { id: string; width?: Block['width']; rowStart?: boolean },
>(source: readonly T[], target: readonly T[], blockId: string): BlockMovePlan<T> | null {
  const index = source.findIndex((b) => b.id === blockId)
  if (index === -1) return null
  if (target.some((b) => b.id === blockId)) return null

  const { blocks: nextSource } = detachKeepingRows(source, index)
  return { source: nextSource, target: [...target, withoutLayout(source[index])] }
}

/** One move per block at a time — a second pick landing on the same block
 *  while the first move is still writing is a no-op, matching BlockCanvas's
 *  own `moveInFlightRef` guard on `moveBlockIntoNewPage`. Kept, not dropped:
 *  `ShellCommands`'s own `setPaletteOpen(false)` on select only tells React
 *  to unmount the palette on its next render, so a double-↵ fired on the
 *  same tick (before that render happens) reaches this function twice for
 *  the same `blockId` — proven by move-block.test.ts's "refuses a second
 *  move of the same block while the first is still writing"; without this
 *  guard that test fails, because nothing else stops the second call. */
const inFlight = new Set<string>()

export interface MoveBlockToPageInput {
  blockId: string
  sourcePageId: string
  targetPageId: string
  pondId: string | null
}

/** One undoable step across both pages — `recordIds` is SOURCE then TARGET,
 *  so a caller reading it back knows which half is which without re-deriving
 *  it from the ids themselves. `handle` is the already-reserved session-undo
 *  slot (`sessionUndo.rememberPending`, called before either write started)
 *  — a caller hands it straight to `sessionUndo.undoHandle`, rather than
 *  reserving a second, wrongly-ordered slot of its own. */
export interface MoveBlockResult {
  pondId: string | null
  recordIds: readonly string[]
  handle: UndoHandle | null
}

/** Thrown instead of resolving `null` when a compensating write — after the
 *  move's own physical writes already landed — itself fails. The block may
 *  now sit on both pages with nothing left to undo, which is a worse state
 *  than a plain "couldn't move": `moveBlockAndStageUndo` tells the two apart
 *  so the notice stays honest. */
export class MoveCompensationFailed extends Error {}

/** The one home for the toast's "nothing happened" copy, so the honest
 *  (`dataLoss: true`) and plain variants can never drift apart into two
 *  separately-worded strings. */
function couldNotMoveMessage(label: string, dataLoss: boolean): string {
  return `Couldn't move ${label}${dataLoss ? ' — it may now be on both pages' : ''}`
}

/**
 * Best-effort write of `blocks` back onto `pageId` — for when one side of a
 * move landed but the step as a whole must be unwound. Never throws past
 * this function: the caller already has the real error to report (or, for a
 * move that landed but can't be remembered, there is no error at all, only
 * a log line). Resolves `false` rather than throwing so a caller unwinding
 * BOTH pages can still attempt the other side's restore.
 */
async function restoreBlocks(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  pageId: string,
  blocks: Block[]
): Promise<boolean> {
  try {
    await commitBlocks(supabase, queryClient, pageId, blocks)
    await queryClient.invalidateQueries({ queryKey: ['page', pageId] })
    return true
  } catch (err) {
    console.error('[move-block] compensating write failed', pageId, err)
    return false
  }
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
    if (!source || !source.blocks.some((b) => b.id === blockId)) return null

    const target = await getPage(supabase, targetPageId)
    if (!target) return null

    const plan = planBlockMove(source.blocks, target.blocks, blockId)
    if (!plan) {
      // `source` was already confirmed to hold `blockId` above, so the only
      // way `planBlockMove` returns null here is the target already holding
      // it — a stale retry replaying a move that already landed.
      const message = `moveBlockToPage: target ${targetPageId} already holds block ${blockId}`
      if (process.env.NODE_ENV !== 'production') throw new Error(message)
      console.error(message)
      return null
    }

    // KAN-368's pattern (`use-page-draft.ts`'s `reserveUndoSlot`): the slot
    // exists on the stack from before either write starts, so a ⌘Z pressed
    // while the move is still in flight takes THIS step rather than falling
    // through to whatever settled underneath it. `resolveRecordIds` is a
    // no-op when there's no pond to remember a step in.
    let resolveRecordIds: (ids: readonly string[] | null) => void = () => {}
    let handle: UndoHandle | null = null
    if (pondId) {
      const recordIds = new Promise<readonly string[] | null>((resolve) => {
        resolveRecordIds = resolve
      })
      handle = sessionUndo.rememberPending({ pondId, recordIds })
    }

    // A holder, not two `let`s: each side's id is read back out through a
    // normal `const` destructure (below) rather than past a cast, since TS's
    // control-flow narrowing can't see either `onPending` closure's write
    // and would otherwise narrow a bare `let x: string | null = null` read
    // at this point to the literal `null`.
    const landedRecordIds: { source: string | null; target: string | null } = {
      source: null,
      target: null,
    }

    // Appended first: if this throws (the write never lands), the source
    // removal below never runs — the source page is left exactly as it was,
    // and the reserved slot resolves to nothing so ⌘Z drops it cleanly.
    try {
      const { remembered: targetRemembered } = await commitBlocks(
        supabase,
        queryClient,
        targetPageId,
        plan.target,
        {
          ownEdit: true,
          before: target.blocks,
          pondId,
          onPending: (ids) => {
            landedRecordIds.target = ids?.[0] ?? null
          },
        }
      )
      await targetRemembered
      await queryClient.invalidateQueries({ queryKey: ['page', targetPageId] })
    } catch (err) {
      resolveRecordIds(null)
      throw err
    }

    try {
      const { remembered: sourceRemembered } = await commitBlocks(
        supabase,
        queryClient,
        sourcePageId,
        plan.source,
        {
          ownEdit: true,
          before: source.blocks,
          pondId,
          onPending: (ids) => {
            landedRecordIds.source = ids?.[0] ?? null
          },
        }
      )
      await sourceRemembered
      await queryClient.invalidateQueries({ queryKey: ['page', sourcePageId] })
    } catch (err) {
      // The target append landed but the source removal didn't (a single
      // `saveBlocks` call either lands whole or not at all, so the source
      // itself is untouched) — the block must not be left on both pages
      // with nothing to undo.
      const restored = await restoreBlocks(supabase, queryClient, targetPageId, target.blocks)
      resolveRecordIds(null)
      if (!restored) throw new MoveCompensationFailed(String(err))
      throw err
    }

    const { source: sourceRecordId, target: targetRecordId } = landedRecordIds
    if (sourceRecordId === null || targetRecordId === null) {
      // Both physical writes landed, but one side's change-log record never
      // did — a one-sided step can never be undone correctly (⌘Z would only
      // reverse half the move), so the whole move is unwound rather than
      // offered as a step with a missing half.
      console.error('[move-block] move landed without a full undo record', {
        blockId,
        sourcePageId,
        targetPageId,
        sourceRecordId,
        targetRecordId,
      })
      const [targetRestored, sourceRestored] = await Promise.all([
        restoreBlocks(supabase, queryClient, targetPageId, target.blocks),
        restoreBlocks(supabase, queryClient, sourcePageId, source.blocks),
      ])
      resolveRecordIds(null)
      if (!targetRestored || !sourceRestored) {
        throw new MoveCompensationFailed('move landed without a full undo record, and the unwind itself failed')
      }
      return null
    }

    const recordIds = [sourceRecordId, targetRecordId]
    resolveRecordIds(recordIds)
    return { pondId, recordIds, handle }
  } finally {
    inFlight.delete(blockId)
  }
}

/**
 * The block-menu `move to…` picker's own commit: the same split as
 * `move.ts`'s `moveAndStageUndo` (a lib function, the caller supplies its
 * own `stageUndo`/`notify`/`navigateTo`) — `ShellCommands` only resolves the
 * picked row into a `targetPage` and hands the rest here, rather than
 * staging the toast itself.
 *
 * `null` back from `moveBlockToPage` covers every "nothing to move" case
 * alike — the block already gone from the source, the target trashed out
 * from under the open picker, or a move that landed but couldn't be
 * remembered and was unwound — and all of them are told apart from a silent
 * close, since the person watched the picker confirm a target and got
 * nothing for it.
 */
export async function moveBlockAndStageUndo(
  supabase: SupabaseClient<Database>,
  queryClient: QueryClient,
  input: MoveBlockToPageInput & { label: string },
  targetPage: { id: string; type: string; title: string },
  stageUndo: (input: StageUndoInput) => string,
  notify: (message: string) => void,
  navigateTo: (node: { id: string; type: string; title: string }) => void
): Promise<void> {
  let result: MoveBlockResult | null
  try {
    result = await moveBlockToPage(supabase, queryClient, input)
  } catch (err) {
    notify(couldNotMoveMessage(input.label, err instanceof MoveCompensationFailed))
    return
  }
  if (!result) {
    notify(couldNotMoveMessage(input.label, false))
    return
  }

  // No pond to remember a step in (or, unreachably, a reserved slot with no
  // handle) — the move itself already landed, there's just nothing to hand
  // `sessionUndo`, so no toast.
  const { pondId, handle } = result
  if (pondId === null || !handle) return

  queryClient.invalidateQueries({ queryKey: changeLogKey() })
  stageUndo({
    message: `moved 1 block to ${targetPage.title || 'Untitled'} ·`,
    undoLabel: 'undo',
    actionLabel: 'open',
    action: () => navigateTo(targetPage),
    undo: () =>
      // Mirrors `moveAndStageUndo`'s own undo (move.ts): flush either page's
      // own debounced save before the undo RPC runs, or a save still
      // in flight on either side lands after undo and overwrites it.
      Promise.all([flushPendingPageSave(input.sourcePageId), flushPendingPageSave(input.targetPageId)])
        .then(() => sessionUndo.undoHandle(pondId, handle))
        .then((outcome) => applyUndoOutcome('undo', outcome, queryClient)),
  })
}
