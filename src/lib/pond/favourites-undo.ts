/**
 * A tiny client-only, per-pond "last reorder" slot for the favourites band's
 * ⌘Z (KAN-569 `choices`). Not `sessionUndo`/the change-log RPC: there is no
 * `target_page_id` a favourites reorder can key against, and teaching the RPC
 * a new undo kind needs a migration this ticket doesn't own. No React, no
 * Supabase — `useFavouritePage` writes into it, `ShellCommands`' ⌘Z reads it.
 */

const pending = new Map<string, readonly string[]>()

export function rememberReorder(pondId: string, before: readonly string[]): void {
  pending.set(pondId, before)
}

export function takePendingReorder(pondId: string): readonly string[] | null {
  const before = pending.get(pondId)
  if (before === undefined) return null
  pending.delete(pondId)
  return before
}

export function clearPendingReorder(pondId: string): void {
  pending.delete(pondId)
}
