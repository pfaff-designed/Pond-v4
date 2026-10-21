/**
 * What every undo/redo caller owes the rest of the app once a step settles —
 * shared by `ShellCommands`' ⌘Z/⇧⌘Z and the composer's own undo chip (KAN-179)
 * so a `done` outcome from either route invalidates the same caches and a
 * stale/blocked/refused one reads the same notice, rather than each caller
 * carrying its own copy.
 */

import type { QueryClient } from '@tanstack/react-query'
import { requestComposerNotice } from '@/lib/terminal-focus'
import { pagesKey } from '@/lib/pages/keys'
import { rowsKey } from '@/lib/modules/view/rows-key'
import type { BlockedReason, RefusedReason, StaleReason } from './undo'
import type { SessionUndoOutcome } from './session-undo'
import { changeLogKey } from './keys'

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
    return
  }
  requestComposerNotice(noticeForReason(direction, result.reason))
}
