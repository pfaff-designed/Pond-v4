/**
 * Deletion blast-radius helpers (ticket-27).
 *
 * A deletion's "blast radius" is how much it takes with it. For a page in the
 * unified tree that is its whole subtree — deleting a page cascades to every
 * descendant via the `parent_id ... on delete cascade` FK. These pure helpers
 * compute that radius from an in-memory tree node so the UI can (a) decide
 * whether a subtree delete needs the styled confirm modal and (b) state the real
 * descendant count in it. Framework-agnostic, no React — jest covers them.
 */

/** The minimal self-referential tree shape these helpers need. */
export interface TreeNodeLike {
  id: string
  children: TreeNodeLike[]
}

/**
 * Count every descendant of a node (children, grandchildren, … to any depth).
 * The node itself is NOT counted — this is "how many pages live *inside* it".
 */
export function countDescendants(node: TreeNodeLike): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}

/** The set of ids removed if this node is deleted: the node plus its whole subtree. */
export function subtreeIds(node: TreeNodeLike): Set<string> {
  const ids = new Set<string>([node.id])
  for (const child of node.children) {
    for (const id of subtreeIds(child)) ids.add(id)
  }
  return ids
}

/**
 * A subtree delete (descendantCount > 0) is destructive enough to warrant a
 * styled confirm that states the blast radius; a leaf (0 descendants) skips the
 * modal and goes straight to the undo toast.
 */
export function needsConfirm(descendantCount: number): boolean {
  return descendantCount > 0
}

/**
 * The blast-radius sentence for the confirm dialog. Reads naturally at every
 * count: "Deletes 1 page inside." / "Deletes 3 pages inside."
 */
export function blastRadiusLabel(descendantCount: number): string {
  const noun = descendantCount === 1 ? 'page' : 'pages'
  return `Deletes ${descendantCount} ${noun} inside.`
}
