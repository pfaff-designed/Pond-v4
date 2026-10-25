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
