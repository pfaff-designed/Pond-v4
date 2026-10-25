/**
 * What every undo/redo caller owes the rest of the app once a step settles —
 * shared by `ShellCommands`' ⌘Z/⇧⌘Z and the composer's own undo chip (KAN-179)
 * so a `done` outcome from either route invalidates the same caches and a
 * stale/blocked/refused one reads the same notice, rather than each caller
 * carrying its own copy.
 */

import type { QueryClient } from '@tanstack/react-query'
import { requestComposerNotice } from '@/lib/terminal-focus'
import { homeQueryKey, pagesKey, resolveLinkParentId } from '@/lib/pages/keys'
import type { HomePage } from '@/lib/pages/home'
import { rowsKey } from '@/lib/modules/view/rows-key'
import type { BlockedReason, RefusedReason, StaleReason } from './undo'
import type { SessionUndoOutcome } from './session-undo'
import { changeLogKey } from './keys'
import { removeByRecordId } from './accept-marks'
import { readDuplicatePageSnapshot, readMoveSnapshot } from './page-changes'

/** One line for a stale/blocked/refused ⌘Z or ⇧⌘Z, in the direction it was pressed. */
export function noticeForReason(
  direction: 'undo' | 'redo',
  reason: StaleReason | BlockedReason | RefusedReason
): string {
  switch (reason) {
    case 'page-changed':
      return `can't ${direction} — the page changed since. revert it from the change log.`
    case 'record-changed':
      return `can't ${direction} — the record changed since. revert it from the change log.`
    case 'linked-elsewhere':
      return `can't ${direction} yet — something else links to it.`
    case 'name-taken':
      return `can't ${direction} yet — the name is taken.`
    case 'not-an-area':
      return `can't ${direction} — the page is no longer an area.`
    case 'already-undone':
      return `can't ${direction} — that was already undone.`
    case 'not-undone':
      return `can't ${direction} — that was never undone.`
    case 'not-undoable':
      return `can't ${direction} that change.`
    case 'other-pond':
      return `can't ${direction} — that happened in another pond.`
    case 'not-found':
      return `can't ${direction} — that record is gone.`
    case 'page-gone':
      return `can't ${direction} — the page is gone.`
    case 'already-restored':
      return `can't ${direction} — that page was already restored.`
  }
}

/**
 * The sidebar/rail mark (`pagesKey`), the "Changes to this page" panel
 * (`changeLogKey` — a prefix of its `pageChangesKey`, so one invalidation
 * reaches it at any page/pond), the specific pages the step's records
 * touched (their own open `DocumentPanel`, keyed `['page', id]`), and each
 * one's row cache (`rowsKey`, so a calendar/board/table already rendering
 * the row redraws it from the reverted database value instead of waiting
 * on an unrelated refetch — the undo/redo RPC's own records never carry an
 * `add_row`/`edit_row` action to filter on, only `undo`/`redo`, so this
 * invalidates every touched page's rows key rather than trying to tell rows
 * from non-rows) on `done`; a one-line notice, or clearing one left up by an
 * earlier chord/press, otherwise. A stale/blocked/refused outcome changes
 * nothing, so it says why instead, in the direction it was pressed.
 */
export function applyUndoOutcome(
  direction: 'undo' | 'redo',
  result: SessionUndoOutcome,
  queryClient: QueryClient
): void {
  if (result.outcome === 'empty') {
    requestComposerNotice('')
    return
  }
  if (result.outcome === 'done') {
    requestComposerNotice('')
    void queryClient.invalidateQueries({ queryKey: pagesKey() })
    void queryClient.invalidateQueries({ queryKey: changeLogKey() })
    const pageIds = new Set(
      result.records.map((record) => record.targetPageId).filter((id): id is string => id !== null)
    )
    for (const id of pageIds) {
      void queryClient.invalidateQueries({ queryKey: ['page', id] })
      void queryClient.invalidateQueries({ queryKey: rowsKey(id) })
    }
    // A settled `move`'s before/after double as its link edit's before/after
    // (KAN-467, migration 0031 part C): undo/redo rewrites the OLD and NEW
    // link parents' `blocks`, not just the moved page's own `['page', C]`
    // key the loop above already covers — an open draft of either parent
    // must rebase onto that write too, the same way Rail.tsx's own move
    // already invalidates both sides. `readMoveSnapshot` returns null for
    // any other action's before/after, so this stays a no-op outside a move
    // — `homeId` is read from the cache lazily, only once a move snapshot
    // actually turns up, so a caller's minimal `invalidateQueries`-only fake
    // queryClient (no `getQueryData`) still works for every other action.
    let homeId: string | undefined
    let homeIdRead = false
    for (const record of result.records) {
      for (const snapshot of [readMoveSnapshot(record.before), readMoveSnapshot(record.after)]) {
        if (snapshot === null) continue
        if (!homeIdRead) {
          homeId = queryClient.getQueryData<HomePage>(homeQueryKey(result.step.pondId))?.id
          homeIdRead = true
        }
        const linkParentId = resolveLinkParentId(snapshot.parentId, homeId)
        if (linkParentId) void queryClient.invalidateQueries({ queryKey: ['page', linkParentId] })
      }
      // A real ⌘Z's undo record carries the duplicate's link info on its OWN
      // `before` (`change_log_step`, 0030, swaps before/after: the undo
      // record's `before` is the original's `after`, `after` is the
      // original's `before`, which is always null here) — so both sides are
      // tried, same as the move loop above. Already an absolute page id,
      // unlike a move's `parentId`, so no `resolveLinkParentId` is needed.
      for (const snapshot of [
        readDuplicatePageSnapshot(record.before),
        readDuplicatePageSnapshot(record.after),
      ]) {
        if (snapshot?.linkParentId) {
          void queryClient.invalidateQueries({ queryKey: ['page', snapshot.linkParentId] })
        }
      }
    }
    // `result.records` are the NEW undo/redo records the RPC just logged, never
    // the original accept's record id `recordAccept` stored a mark under
    // (`undo.ts`: "each gains an `undo`/`redo` record" — a different id). The
    // original ids are `result.step.recordIds`. Only an undo clears marks: the
    // redone change is not re-marked (spec is silent; chosen in KAN-143 PLAN.md).
    if (direction === 'undo') for (const id of result.step.recordIds) removeByRecordId(id)
    return
  }
  requestComposerNotice(noticeForReason(direction, result.reason))
}
