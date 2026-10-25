/**
 * Sibling-name uniqueness helpers (issue #84).
 *
 * A page's title must be unique among its siblings — same `(user_id, workspace,
 * parent_id)` scope — compared case-insensitively and whitespace-trimmed. This
 * mirrors the DB unique index `pages_sibling_title_uniq` (see
 * supabase/migrations/0009_unique_sibling_title.sql), so the app can pick a
 * non-colliding title BEFORE it hits the constraint, and recognise the DB's
 * violation when a race slips through.
 *
 * Two callers, two behaviours (decided in #84): programmatic create paths
 * (manual "add page", AI create_page, seeds) AUTO-SUFFIX via
 * {@link nextAvailableTitle}; a manual rename instead surfaces
 * {@link DuplicateTitleError} inline rather than silently renaming.
 */

/** Normalise a title for uniqueness comparison — matches the index's lower(btrim(title)). */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

/**
 * Given the desired title and the titles already taken by its siblings, return a
 * title that doesn't collide (case-insensitively). Appends " 2", " 3", … —
 * matching the save-picker's disambiguation. Pure + deterministic.
 */
export function nextAvailableTitle(desired: string, siblingTitles: Iterable<string>): string {
  const taken = new Set([...siblingTitles].map(normalizeTitle))
  const base = desired.trim() || 'Untitled'
  if (!taken.has(normalizeTitle(base))) return base
  let n = 2
  while (taken.has(normalizeTitle(`${base} ${n}`))) n++
  return `${base} ${n}`
}

/**
 * Decide whether a move needs to rename the dragged page (KAN-470): only when
 * its title actually clashes (case/whitespace-insensitively) with a
 * destination sibling — `undefined` otherwise, even if `nextAvailableTitle`'s
 * trimmed base would differ from the raw, untrimmed title. Comparing a
 * normalized value against a raw one is what renamed every move of a
 * leading/trailing-space title, clash or not.
 */
export function moveTitle(draggedTitle: string, destinationTitles: Iterable<string>): string | undefined {
  const normalizedDragged = normalizeTitle(draggedTitle)
  if (normalizedDragged === '') return undefined
  const taken = new Set([...destinationTitles].map(normalizeTitle))
  if (!taken.has(normalizedDragged)) return undefined
  return nextAvailableTitle(draggedTitle, destinationTitles)
}

/**
 * Thrown by a manual rename when the new title collides with an existing sibling.
 * The UI catches it and shows the message inline instead of persisting.
 */
export class DuplicateTitleError extends Error {
  // A plain field, not a `public readonly` constructor parameter property: the
  // evals (scripts/eval-*.mts) import the app source through Node's strip-only
  // TypeScript loader, which cannot compile a parameter property. One of them
  // reaches this file via src/lib/pages/client.ts, so the sugar took the whole
  // editing eval down with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX.
  readonly title: string
  constructor(title: string) {
    super(`A page named “${title}” already exists here.`)
    this.title = title
    this.name = 'DuplicateTitleError'
  }
}
