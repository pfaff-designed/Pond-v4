/**
 * Surgical row operations for optimistic-delete caches (ticket-27).
 *
 * When a deletion is staged, the row is removed from the cached list; undo must
 * put back ONLY that row. Restoring a whole pre-delete snapshot is wrong the
 * moment two deletions overlap: undoing A from a snapshot that still contains B
 * resurrects B in the cache while B's own delete is pending/committed. These
 * helpers make the restore surgical. Pure — jest-covered in
 * deletion-undo-wiring.test.ts.
 */

export interface RowLike {
  id: string
}

/** The list without the given row (no-op if absent). */
export function removeRow<T extends RowLike>(rows: T[], id: string): T[] {
  return rows.filter((r) => r.id !== id)
}

/**
 * The list with exactly this row re-inserted (appended; callers re-sort or
 * invalidate to reconcile ordering). Duplicate-safe: if the row is already
 * present (e.g. a refetch landed first), the list is returned unchanged.
 */
export function restoreRow<T extends RowLike>(rows: T[], row: T): T[] {
  if (rows.some((r) => r.id === row.id)) return rows
  return [...rows, row]
}
