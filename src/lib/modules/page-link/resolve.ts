/**
 * F27 — pure page-link resolution helpers.
 *
 * A linked kanban card holds a `pageId` reference; the page it points at is the
 * source of truth for the card's title. Both "what is this page's live title?" and
 * "which pages can I link to?" are answered from the already-loaded `['pages',
 * workspace]` rows cache the rail/overview surfaces read — no extra fetch. Kept pure
 * (no React) so the resolution logic is jest-testable and the context provider is a
 * thin shell over these.
 */

/** The minimal node reference a linked card renders + navigates with. */
export interface PageRef {
  id: string
  title: string
  type: string
}

/** The subset of a `PageRow` these helpers read (id/title/type). */
export interface PageLike {
  id: string
  title: string
  type: string
}

/**
 * Resolve a linked page's live ref from the rows cache, or `null` when the page is
 * gone (deleted → the card is an orphan; the caller degrades gracefully). An empty
 * stored title resolves to 'Untitled', matching what the rail/editor display.
 */
export function resolvePageFromRows(rows: readonly PageLike[], pageId: string): PageRef | null {
  const row = rows.find((r) => r.id === pageId)
  return row ? { id: row.id, title: row.title || 'Untitled', type: row.type } : null
}

/**
 * Candidate pages for the "link existing" picker. A case-insensitive title
 * substring match over the rows cache; an empty query lists the first `limit` rows.
 * Same-workspace only by construction — `rows` is already workspace-scoped.
 */
export function searchPagesInRows(rows: readonly PageLike[], query: string, limit = 8): PageRef[] {
  const q = query.trim().toLowerCase()
  const matches = q ? rows.filter((r) => (r.title || '').toLowerCase().includes(q)) : rows
  return matches
    .slice(0, limit)
    .map((r) => ({ id: r.id, title: r.title || 'Untitled', type: r.type }))
}
