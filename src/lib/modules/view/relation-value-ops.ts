/**
 * Pure edit ops for a relation value — a `string[]` of linked page-ids (#20).
 * The RelationValue picker drives these; keeping them pure means the add /
 * remove / single-replace logic is tested without rendering. Every op returns a
 * fresh array (never mutates the input).
 */

/**
 * Link a page into a relation value. `single` (radio cap, UI-enforced per spec
 * decision 4) replaces the whole value with just this id; otherwise the id is
 * appended when absent, and adding an already-linked id is a no-op (idempotent).
 */
export function addLink(value: string[], id: string, single = false): string[] {
  if (single) return [id]
  return value.includes(id) ? value.slice() : [...value, id]
}

/** Remove a linked id from a relation value (drops every occurrence). */
export function removeLink(value: string[], id: string): string[] {
  return value.filter((v) => v !== id)
}
