/**
 * KAN-469: the one flow both the rail's drag-to-reparent and ⌘K's "move page
 * to…" row run — same split as `duplicate.ts` (a lib function, caller
 * supplies its own `stageUndo`/`notify`/`navigateTo`).
 */

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { computeMove, type DropZone } from '@/lib/rail/tree'
import { applyMoveOptimistic, type PageRow } from './tree'
import { movePage } from './client'
import { moveTitle } from './dedupe-title'
import { pagesKey, resolveLinkParentId } from './keys'
import { flushPendingPageSave } from './page-flush'
import type { HomePage } from './home'
import { changeLogKey } from '@/lib/change-log/keys'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { applyUndoOutcome } from '@/lib/change-log/undo-outcome'
import { readMoveSnapshot, moveParentLabel } from '@/lib/change-log/page-changes'
import type { StageUndoInput } from '@/lib/deletion/useDeletionUndo'

/**
 * Commit a move: resolve it (computeMove absorbs self / cycle / no-op → null),
 * apply it optimistically so the caller's own view restructures instantly,
 * then persist. On failure, restore the pre-move snapshot and surface the
 * miss through the caller's own `notify`. Mirrors Rail's `withUser`: no
 * signed-in user is a silent no-op, and a successful move invalidates
 * `pagesKey()` once settled.
 */
export async function moveAndStageUndo(
  queryClient: QueryClient,
  pondId: string | null,
  rows: PageRow[],
  draggedId: string,
  targetId: string,
  zone: DropZone,
  home: HomePage | null | undefined,
  pondName: string,
  stageUndo: (input: StageUndoInput) => string,
  notify: (message: string) => void,
  navigateTo: (node: { id: string; type: string; title: string }, opts?: { openTemplates?: boolean }) => void
): Promise<void> {
  const move = computeMove(rows, draggedId, targetId, zone)
  if (!move) return

  const draggedRow = rows.find((r) => r.id === draggedId)
  const title = draggedRow?.title || 'Untitled'

  // KAN-470: the destination's other children (the new sibling group minus
  // the moved page itself) — if the dragged title collides with one of
  // them, suffix it the same way `createPage` already would.
  const destinationSiblingTitles = move.siblingOrder
    .filter((id) => id !== draggedId)
    .map((id) => rows.find((r) => r.id === id)?.title)
    .filter((t): t is string => t !== undefined)
  const newTitle = draggedRow ? moveTitle(draggedRow.title, destinationSiblingTitles) : undefined

  // Resolved before the move so both sides can be flushed ahead of the RPC
  // (below) and reused for the invalidate after it — one resolve, no drift.
  const oldLinkParentId = draggedRow ? resolveLinkParentId(draggedRow.parent_id, home?.id) : undefined
  const newLinkParentId = resolveLinkParentId(move.newParentId, home?.id)

  const snapshot = applyMoveOptimistic(
    queryClient,
    {
      movedId: draggedId,
      newParentId: move.newParentId,
      siblingOrder: move.siblingOrder,
      ...(newTitle !== undefined ? { newTitle } : {}),
    },
    pondId
  )

  try {
    // The move's own RPC reads and rewrites both link-parents' `blocks` —
    // flush either side's own debounced save first, or a save already in
    // flight lands after the RPC and overwrites its edit with stale blocks
    // (the same race `child-links.ts`'s own write seams guard against).
    await Promise.all([flushPendingPageSave(oldLinkParentId), flushPendingPageSave(newLinkParentId)])

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const record = await movePage(supabase, {
      id: draggedId,
      newParentId: move.newParentId,
      siblingOrder: move.siblingOrder,
      ...(newTitle !== undefined ? { newTitle } : {}),
    })
    await queryClient.invalidateQueries({ queryKey: pagesKey() })

    const after = record ? readMoveSnapshot(record.after) : null
    if (pondId && record && draggedRow && after) {
      const handle = sessionUndo.rememberPending({
        pondId,
        recordIds: Promise.resolve([record.id]),
      })
      queryClient.invalidateQueries({ queryKey: changeLogKey() })
      // The move's own RPC edits the old and new link-parents' `blocks` —
      // rebase an open draft of either onto that write instead of waiting
      // for a reload.
      if (oldLinkParentId) queryClient.invalidateQueries({ queryKey: ['page', oldLinkParentId] })
      if (newLinkParentId) queryClient.invalidateQueries({ queryKey: ['page', newLinkParentId] })
      // KAN-470: a renaming move changes the moved page's own title — an
      // open DocumentPanel's draft only rebases when ['page', id]
      // refreshes (use-page-draft.ts), so without this the open page keeps
      // showing its pre-move title and a later edit's updateTitle clashes
      // with the destination's sibling again.
      if (after.title) queryClient.invalidateQueries({ queryKey: ['page', draggedId] })
      // KAN-470: `after.title` is only present on the RPC's own record when
      // the move clashed and the RPC actually renamed it — the toast and
      // the "open" action read that back rather than trusting the
      // pre-move `draggedRow.title`, so both match what the move really
      // did, not what the client hoped it would.
      const destinationLabel = moveParentLabel(after.parentTitle, home?.title ?? pondName)
      const message = after.title
        ? `moved ${title} to ${destinationLabel} as "${after.title}" ·`
        : `moved ${title} to ${destinationLabel} ·`
      stageUndo({
        message,
        undoLabel: 'undo',
        undo: () =>
          // The undo RPC rewrites both link-parents' `blocks` just like the
          // forward move did — flush either side's own debounced save
          // first (mirrors the guard above), or a save still pending from
          // typing on P/Q lands after undo and overwrites the restored link.
          Promise.all([flushPendingPageSave(oldLinkParentId), flushPendingPageSave(newLinkParentId)])
            .then(() => sessionUndo.undoHandle(pondId, handle))
            .then((outcome) => applyUndoOutcome('undo', outcome, queryClient)),
        action: () => navigateTo(after.title ? { ...draggedRow, title: after.title } : draggedRow),
        actionLabel: 'open',
      })
    }
  } catch {
    if (snapshot) queryClient.setQueryData<PageRow[]>(pagesKey(pondId), snapshot)
    notify(`Couldn't move "${draggedRow?.title || 'Untitled'}"`)
    queryClient.invalidateQueries({ queryKey: pagesKey() })
  }
}
