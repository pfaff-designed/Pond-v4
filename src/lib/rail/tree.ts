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

/** The Life root as a RailNode — synthetic, no children of its own here. */
export const LIFE_NODE: RailNode = {
  id: LIFE_ID,
  parentId: null,
  type: 'life',
  title: 'Life',
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

/** A node is a folder if it's an area or has children (composite pages count). */
export function isFolderNode(node: RailNode): boolean {
  return node.type === 'area' || node.children.length > 0
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
  lifeExpanded: boolean
): FlatRow[] {
  const out: FlatRow[] = [
    { id: LIFE_ID, node: LIFE_NODE, depth: 0, isFolder: true, posInSet: 1, setSize: 1 },
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
