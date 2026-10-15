/**
 * A page's own id shape (Postgres `uuid`) — Framework-agnostic.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Does `value` look like a page id, rather than a title or some other
 *  reference string? Guards a read chip (a page/title/source string, where
 *  only the uuid-shaped ones name a real page row — querying `pages?id=eq.`
 *  with a title or non-page source 400s) and `resolveParentId`'s
 *  `idOrName` (a uuid needs no title lookup; a title does). */
export function isPageId(value: string): boolean {
  return UUID_RE.test(value)
}
