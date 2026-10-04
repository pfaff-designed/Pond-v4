/**
 * Pure tree logic behind the rail's recursive file tree (ticket-28).
 *
 * Everything here is framework-free and jest-covered: building the nested tree
 * from flat page rows, flattening the currently-visible rows (the render AND
 * keyboard order), the WAI-ARIA APG tree keyboard state machine, and the
 * focus-fallback rule for when the focused row disappears (delete / collapse).
 *
 * The Life root is a synthetic node (`LIFE_ID`) — the workspace root, never a
 * row in `pages`. It is the first visible row at depth 0; collapsing it hides
 * the whole tree.
 */

import type { PageRow } from '@/lib/pages/tree'

/** The synthetic id of the Life root — never a real `pages` row. */
export const LIFE_ID = '__life__'

export interface RailNode {
  id: string
  parentId: string | null
  type: string
  title: string
  order: number
  children: RailNode[]
}

/**
 * The Life root as a RailNode — synthetic, no children of its own here. Its title
 * is lowercase, like every other line of the rail's source copy in `Pond 05 Shell`
 * (#101 review); where the boards show capitals it is a CSS transform.
 */
export const LIFE_NODE: RailNode = {
  id: LIFE_ID,
  parentId: null,
  type: 'life',
  title: 'life',
  order: 0,
  children: [],
}

/** Build a nested tree from the flat page list, sorted by order then title. */
export function buildTree(rows: PageRow[]): RailNode[] {
  const byId = new Map<string, RailNode>()
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      parentId: r.parent_id,
      type: r.type,
      title: r.title,
      order: r.order ?? 0,
      children: [],
    })
  }
  const roots: RailNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (arr: RailNode[]) => {
    arr.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    arr.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

/**
 * A node is a folder if it's top-level or has children (#108).
 *
 * There is no `type = 'area'` any more: "an area is a page with pages inside it;
 * it has no technical meaning" (design law), so folder-ness is computed. Every
 * top-level page counts even while empty — that keeps the five seeded pages
 * (Personal · Professional · Health · Finances · Creativity) as rail folders at
 * first run, and it is where a person naturally starts a new area. Any page
 * becomes a folder the moment it gains a child (composite pages included).
 */
export function isFolderNode(node: RailNode): boolean {
  return node.parentId === null || node.children.length > 0
}

/**
 * Does this row carry the AREA voice — the raised label, the accent, the default
 * glyph (#91)? A TOP-LEVEL page does (#108): that is where a person's areas live
 * and the only rows the fixed title→glyph defaults are written for. Per-page
 * glyph/colour is #91's own work; this only replaces the old `type === 'area'`.
 *
 * Deliberately NOT the same predicate as `isFolderNode` — a top-level page is a
 * folder AND an area row, but a nested page with children is a folder only. The
 * two rules answer different questions, so they stay two named functions.
 */
export function isAreaRow(node: RailNode): boolean {
  return node.parentId === null
}

// ── Move (drag-to-reparent / reorder, F25) ───────────────────────────────────

/** Where a dropped node lands relative to the hovered target row. */
export type DropZone = 'before' | 'into' | 'after'

/**
 * Is `nodeId` a descendant of `maybeAncestorId`? Walks `parent_id` up from the
 * node; a node is never its own descendant. Guards against pre-existing cyclic
 * data so a corrupt chain can't loop forever.
 */
export function isDescendant(rows: PageRow[], nodeId: string, maybeAncestorId: string): boolean {
  const parentOf = (id: string) => rows.find((r) => r.id === id)?.parent_id ?? null
  let current = parentOf(nodeId)
  const seen = new Set<string>()
  while (current !== null) {
    if (current === maybeAncestorId) return true
    if (seen.has(current)) break
    seen.add(current)
    current = parentOf(current)
  }
  return false
}

/** The child ids of `parentId` (null = top-level) in visual order — the same
 *  `order`-then-`title` sort `buildTree` uses, so a computed group matches the
 *  rendered one. */
function sortedChildIds(rows: PageRow[], parentId: string | null): string[] {
  return rows
    .filter((r) => (r.parent_id ?? null) === parentId)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
    .map((r) => r.id)
}

/**
 * The parent a drop assigns, or `undefined` if the target/zone is structurally
 * invalid (before/after the synthetic Life root — Life is a set of one, so it's
 * an into-only target). `into` → the target itself (Life → top-level null);
 * before/after → the target's parent (a new sibling of the target).
 */
function moveParent(rows: PageRow[], targetId: string, zone: DropZone): string | null | undefined {
  if (zone === 'into') return targetId === LIFE_ID ? null : targetId
  if (targetId === LIFE_ID) return undefined
  const target = rows.find((r) => r.id === targetId)
  return target ? target.parent_id : undefined
}

/**
 * Whether a drag→drop should offer a landing (drop-line / into-highlight): the
 * target is a real, valid slot and the move wouldn't create a cycle. This is the
 * dragover AFFORDANCE gate — a no-op slot still returns true (the drop just does
 * nothing). Rejects: dropping onto self, an invalid target (before/after Life),
 * or into the dragged node's own subtree.
 */
export function canMove(
  rows: PageRow[],
  draggedId: string,
  targetId: string,
  zone: DropZone
): boolean {
  if (draggedId === targetId) return false
  if (!rows.some((r) => r.id === draggedId)) return false
  const newParentId = moveParent(rows, targetId, zone)
  if (newParentId === undefined) return false
  if (
    newParentId !== null &&
    (newParentId === draggedId || isDescendant(rows, newParentId, draggedId))
  ) {
    return false
  }
  return true
}

/**
 * Resolve a drop into the persisted change, or `null` when nothing should
 * happen (invalid target, cycle, or a no-op that leaves parent AND position
 * unchanged). Returns the new parent and the target sibling group's full id
 * order AFTER the move — densely reindexed `0..N-1` by the caller, which repairs
 * the legacy all-zeros `order` state on first touch.
 */
export function computeMove(
  rows: PageRow[],
  draggedId: string,
  targetId: string,
  zone: DropZone
): { newParentId: string | null; siblingOrder: string[] } | null {
  if (!canMove(rows, draggedId, targetId, zone)) return null
  const newParentId = moveParent(rows, targetId, zone) as string | null

  const group = sortedChildIds(rows, newParentId).filter((id) => id !== draggedId)
  if (zone === 'into') {
    group.push(draggedId)
  } else {
    const ti = group.indexOf(targetId)
    if (ti === -1) return null // target isn't a child of the resolved parent (defensive)
    group.splice(zone === 'before' ? ti : ti + 1, 0, draggedId)
  }

  // No-op: same parent AND identical resulting order → no write, no cache change.
  const dragged = rows.find((r) => r.id === draggedId)!
  if ((dragged.parent_id ?? null) === newParentId) {
    const current = sortedChildIds(rows, newParentId)
    if (current.length === group.length && current.every((id, i) => id === group[i])) {
      return null
    }
  }

  return { newParentId, siblingOrder: group }
}

/**
 * One currently-visible row of the tree, in render order. `posInSet`/`setSize`
 * are the ARIA sibling coordinates at that row's level (the Life root is a
 * set of one).
 */
export interface FlatRow {
  id: string
  node: RailNode
  depth: number
  isFolder: boolean
  posInSet: number
  setSize: number
}

/**
 * Flatten the tree into the list of currently-visible rows — the Life root
 * first (depth 0), then every row whose ancestors are all expanded. This one
 * list drives both rendering and keyboard order, so the two can't drift.
 */
export function flattenVisible(
  roots: RailNode[],
  expanded: ReadonlySet<string>,
  lifeExpanded: boolean,
  /**
   * #312/#320: the root row is named for the POND you are in. `LIFE_NODE`'s own
   * title is the literal `'life'`, which was right when a person had one pond and
   * wrong in every pond after — a new pond's root row read `life` while its header
   * read the pond's real name. Omitted, it stays `LIFE_NODE`'s title.
   */
  rootTitle?: string | null
): FlatRow[] {
  const root = rootTitle ? { ...LIFE_NODE, title: rootTitle } : LIFE_NODE
  const out: FlatRow[] = [
    { id: LIFE_ID, node: root, depth: 0, isFolder: true, posInSet: 1, setSize: 1 },
  ]
  const walk = (nodes: RailNode[], depth: number) => {
    nodes.forEach((node, i) => {
      const folder = isFolderNode(node)
      out.push({
        id: node.id,
        node,
        depth,
        isFolder: folder,
        posInSet: i + 1,
        setSize: nodes.length,
      })
      if (folder && expanded.has(node.id)) walk(node.children, depth + 1)
    })
  }
  if (lifeExpanded) walk(roots, 1)
  return out
}

// ── Keyboard state machine (WAI-ARIA APG tree) ───────────────────────────────

export type TreeKeyCommand =
  | { kind: 'focus'; id: string }
  | { kind: 'expand'; id: string }
  | { kind: 'collapse'; id: string }
  | { kind: 'open'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'addChild'; id: string }

/**
 * The pure keyboard rules: given a key pressed on row `id` within the visible
 * rows `flat`, return the command to apply (or null for keys we don't own).
 *
 *   ↑/↓        move focus through visible rows (clamped at the ends)
 *   Home/End   jump to the first / last visible row
 *   →          expand a closed folder; step into the first child of an open one
 *   ←          collapse an open folder; step out to the parent otherwise
 *   Enter/␣    open the row's page
 *   Delete/⌫   delete the row (never the Life root)
 *   +          add a child page (never the Life root)
 *
 * A stale `id` (row no longer visible — e.g. a deferred update) returns null
 * rather than jumping focus anywhere.
 */
export function treeKeyCommand(
  key: string,
  id: string,
  flat: readonly FlatRow[],
  opts: { expanded: ReadonlySet<string>; lifeExpanded: boolean }
): TreeKeyCommand | null {
  const idx = flat.findIndex((f) => f.id === id)
  if (idx === -1) return null
  const row = flat[idx]
  const isRoot = id === LIFE_ID
  const isOpen = isRoot ? opts.lifeExpanded : opts.expanded.has(id)
  const clampFocus = (to: number): TreeKeyCommand => ({
    kind: 'focus',
    id: flat[Math.max(0, Math.min(flat.length - 1, to))].id,
  })

  switch (key) {
    case 'ArrowDown':
      return clampFocus(idx + 1)
    case 'ArrowUp':
      return clampFocus(idx - 1)
    case 'Home':
      return clampFocus(0)
    case 'End':
      return clampFocus(flat.length - 1)
    case 'ArrowRight': {
      if (!row.isFolder) return null
      if (!isOpen) return { kind: 'expand', id }
      // open folder → step into the first child (the next row, if deeper)
      const next = flat[idx + 1]
      if (next && next.depth > row.depth) return { kind: 'focus', id: next.id }
      return null
    }
    case 'ArrowLeft': {
      if (row.isFolder && isOpen) return { kind: 'collapse', id }
      // step out to the parent (Life is the parent of top-level rows)
      if (isRoot) return null
      const parentId = row.node.parentId ?? LIFE_ID
      return { kind: 'focus', id: parentId }
    }
    case 'Enter':
    case ' ':
      return { kind: 'open', id }
    case 'Delete':
    case 'Backspace':
      return isRoot ? null : { kind: 'delete', id }
    case '+':
      return isRoot ? null : { kind: 'addChild', id }
    default:
      return null
  }
}

/**
 * Where focus should land when the focused row vanishes (deleted, or hidden by
 * an ancestor collapsing): the nearest surviving row after it in the previous
 * order, else the nearest before it, else the Life root — VS Code's rule.
 */
export function focusFallback(
  prevOrder: readonly string[],
  removedId: string,
  visibleIds: ReadonlySet<string>
): string {
  const idx = prevOrder.indexOf(removedId)
  if (idx !== -1) {
    for (let i = idx + 1; i < prevOrder.length; i++) {
      if (visibleIds.has(prevOrder[i])) return prevOrder[i]
    }
    for (let i = idx - 1; i >= 0; i--) {
      if (visibleIds.has(prevOrder[i])) return prevOrder[i]
    }
  }
  return LIFE_ID
}
