/**
 * Pure toggle over a pond's favourite page ids (KAN-475, migration 0035). No
 * React, no Supabase — `useFavouritePage` calls this and writes the result.
 */

/**
 * Toggles `pageId` in `ids`. Absent (including `null` — a pond with no
 * favourites yet) adds it. Present removes every occurrence, keeping the
 * rest in order. Otherwise appends it at the END (spec: "adding appends to
 * the end").
 */
export function toggleFavouritePageId(
  ids: readonly string[] | null | undefined,
  pageId: string
): string[] {
  const current = ids ?? []
  if (current.includes(pageId)) return current.filter((id) => id !== pageId)
  return [...current, pageId]
}

/**
 * Moves `draggedId` to sit before/after `targetId`, keeping everyone else's
 * relative order. The band is flat (no nesting), so there is no `'into'`
 * zone — only `'before'` and `'after'`. A no-op (dropping on self, or either
 * id missing from `ids`) returns `ids` as a new array, unchanged in order.
 */
export function reorderFavouriteIds(
  ids: readonly string[],
  draggedId: string,
  targetId: string,
  zone: 'before' | 'after'
): string[] {
  if (draggedId === targetId) return [...ids]
  if (!ids.includes(draggedId) || !ids.includes(targetId)) return [...ids]

  const rest = ids.filter((id) => id !== draggedId)
  const targetIndex = rest.indexOf(targetId)
  const insertAt = zone === 'before' ? targetIndex : targetIndex + 1
  return [...rest.slice(0, insertAt), draggedId, ...rest.slice(insertAt)]
}
