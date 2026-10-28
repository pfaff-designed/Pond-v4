/**
 * KAN-567: the one flow ⌘K's "delete page" row runs — same split as
 * `move.ts`/`duplicate.ts` (a lib function, caller supplies its own
 * `stageDeletion`/`notify`/`router`).
 */

import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import { subtreeIdsFromRows } from '@/lib/deletion/blast-radius'
import type { StageDeletionInput } from '@/lib/deletion/useDeletionUndo'
import { changeLogKey } from '@/lib/change-log/keys'
import { trashPageUnlinked } from './child-links'
import { pagesKey } from './keys'
import type { PageRow } from './tree'
import { HOME_TYPE, type HomePage } from './home'
import { openWorkspaceUrl, workspaceUrl, type WorkspaceNavRouter } from './nav'

/**
 * Optimistically removes the page, navigates to its real parent row (or
 * `home` when `parent_id` doesn't resolve in `rows`, mirroring Rail's own
 * "open page deleted" fallback), then stages the deferred trash + undo
 * toast. `commit` runs the same `trashPageUnlinked` RPC Rail's leaf delete
 * uses, after the grace window — restoring the row and notifying on
 * failure. `undo` puts the row back and reopens it.
 */
export function deletePageAndStageUndo(
  queryClient: QueryClient,
  router: WorkspaceNavRouter,
  pondId: string | null,
  rows: PageRow[],
  pageId: string,
  home: HomePage | null | undefined,
  stageDeletion: (input: StageDeletionInput) => void,
  notify: (message: string) => void
): void {
  const row = rows.find((r) => r.id === pageId)
  if (!row) return
  const title = row.title || 'Untitled'
  const subtreeIds = subtreeIdsFromRows(rows, pageId)

  queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (prev) => removeRow(prev ?? [], pageId))

  const parentRow = row.parent_id ? rows.find((r) => r.id === row.parent_id) : undefined
  if (parentRow) {
    openWorkspaceUrl(
      workspaceUrl({ id: parentRow.id, type: parentRow.type, title: parentRow.title }),
      router
    )
  } else if (home) {
    openWorkspaceUrl(workspaceUrl({ id: home.id, type: HOME_TYPE, title: home.title }), router)
  }

  const commit: StageDeletionInput['commit'] = async (reason, onWriteSettled) => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      await trashPageUnlinked(supabase, queryClient, { pondId, rootPageId: pageId, subtreeIds })
      // Signal the write itself has landed before the invalidate below — same
      // order `Rail.tsx`'s `withUser` keeps, so another write's own
      // `flushStagedDeletes` never also waits on (and races) this commit.
      onWriteSettled?.()
      if (reason !== 'flush-driven') {
        queryClient.invalidateQueries({ queryKey: ['rows'] })
        queryClient.invalidateQueries({ queryKey: ['page'] })
      }
      await queryClient.invalidateQueries({ queryKey: changeLogKey() })
    } catch {
      queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (prev) => restoreRow(prev ?? [], row))
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      notify(`Couldn't delete "${title}"`)
    }
  }

  stageDeletion({
    message: `deleted ${title} ·`,
    undoLabel: 'undo',
    scope: 'rail',
    id: pageId,
    commit,
    undo: () => {
      queryClient.setQueryData<PageRow[]>(pagesKey(pondId), (prev) => restoreRow(prev ?? [], row))
      queryClient.invalidateQueries({ queryKey: pagesKey() })
      openWorkspaceUrl(workspaceUrl({ id: row.id, type: row.type, title: row.title }), router)
    },
  })
}
