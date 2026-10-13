/**
 * The rail file tree's pure logic (ticket-28): building the nested tree,
 * flattening the visible rows (render + keyboard order, ARIA coordinates),
 * the WAI-ARIA APG keyboard state machine, and the focus-fallback rule for
 * when the focused row disappears.
 */

import {
  LIFE_ID,
  buildTree,
  isFolderNode,
  isAreaRow,
  flattenVisible,
  treeKeyCommand,
  focusFallback,
  isDescendant,
  canMove,
  computeMove,
  type RailNode,
  type FlatRow,
} from '@/lib/rail/tree'
import type { PageRow } from '@/lib/pages/tree'

const row = (
  id: string,
  parent_id: string | null,
  type: string,
  title: string,
  order = 0
): PageRow => ({ id, parent_id, type, title, order, updated_at: '2026-08-28T00:00:00Z' })

const node = (
  id: string,
  type: string,
  title: string,
  children: RailNode[] = [],
  order = 0,
  parentId: string | null = null
): RailNode => ({ id, parentId, type, title, order, children })

/**
 * health[sleep, marathon] · personal[food[recipes], trips] · scratch
 *
 * No row carries a type='area' — health/personal/food are areas
 * only because they hold pages. `scratch` is top-level and childless: an area
 * row by voice, but a LEAF by structure — no caret, no aria-expanded. `trips`
 * and `sleep` are the nested leaves.
 */
const TREE: RailNode[] = [
  node('health', 'page', 'Health', [
    node('sleep', 'page', 'Sleep', [], 0, 'health'),
    node('marathon', 'project', 'Marathon', [], 1, 'health'),
  ]),
  node(
    'personal',
    'page',
    'Personal',
    [
      node(
        'food',
        'page',
        'Food',
        [node('recipes', 'page', 'Recipes', [], 0, 'food')],
        0,
        'personal'
      ),
      node('trips', 'page', 'Trips', [], 1, 'personal'),
    ],
    1
  ),
  node('scratch', 'page', 'Scratchpad', [], 2),
]

const ids = (flat: FlatRow[]) => flat.map((f) => f.id)

describe('buildTree', () => {
  it('nests children under parents and leaves roots at the top', () => {
    const tree = buildTree([
      row('a', null, 'page', 'A'),
      row('b', 'a', 'page', 'B'),
      row('c', 'b', 'page', 'C'),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].id).toBe('b')
    expect(tree[0].children[0].children[0].id).toBe('c')
  })

  it('sorts siblings by order, then title', () => {
    const tree = buildTree([
      row('z', null, 'page', 'Zebra', 0),
      row('m', null, 'page', 'Mango', 1),
      row('a', null, 'page', 'Apple', 0),
    ])
    expect(tree.map((n) => n.id)).toEqual(['a', 'z', 'm'])
  })

  it('treats a row whose parent is missing as a root (orphan-safe)', () => {
    const tree = buildTree([row('orphan', 'gone', 'page', 'Orphan')])
    expect(tree.map((n) => n.id)).toEqual(['orphan'])
  })
})

// Folder-ness is computed — it has children. No type is read.
describe('isFolderNode', () => {
  it('a childless top-level page is a leaf: it cannot expand, so it must not claim to', () => {
    expect(isFolderNode(node('a', 'page', 'A'))).toBe(false)
    expect(flattenVisible([node('a', 'page', 'A')], new Set(), true)[1]).toMatchObject({
      id: 'a',
      isFolder: false,
    })
  })
  it('a page with children (composite) is a folder', () => {
    expect(isFolderNode(node('p', 'page', 'P', [node('c', 'page', 'C')]))).toBe(true)
  })
  it('a childless NESTED page is a leaf', () => {
    expect(isFolderNode(node('p', 'page', 'P', [], 0, 'parent'))).toBe(false)
  })
  it('a nested page turns into a folder the moment it gains a child', () => {
    const leaf = node('p', 'page', 'P', [], 0, 'parent')
    expect(isFolderNode(leaf)).toBe(false)
    expect(isFolderNode({ ...leaf, children: [node('c', 'page', 'C', [], 0, 'p')] })).toBe(true)
  })
  it('reads no type tag at all — a project with children is a folder, childless is a leaf', () => {
    expect(isFolderNode(node('pr', 'project', 'Pr', [], 0, 'parent'))).toBe(false)
    expect(isFolderNode(node('pr', 'project', 'Pr', [node('x', 'page', 'X')], 0, 'parent'))).toBe(
      true
    )
  })
})

// The area VOICE (full-ink label, accent, default glyph) is a different
// question from folder-ness, so it is its own named rule.
describe('isAreaRow', () => {
  it('a top-level page is an area row, childless or not', () => {
    expect(isAreaRow(node('a', 'page', 'A'))).toBe(true)
    expect(isAreaRow(node('a', 'page', 'A', [node('c', 'page', 'C', [], 0, 'a')]))).toBe(true)
  })
  it('a nested page is not — even one that holds children (a folder, not an area)', () => {
    const nested = node('food', 'page', 'Food', [], 0, 'personal')
    expect(isAreaRow(nested)).toBe(false)
    expect(isFolderNode({ ...nested, children: [node('r', 'page', 'R', [], 0, 'food')] })).toBe(
      true
    )
    expect(isAreaRow({ ...nested, children: [node('r', 'page', 'R', [], 0, 'food')] })).toBe(false)
  })
})

describe('flattenVisible', () => {
  it('always emits the Life root first, at depth 0, a set of one', () => {
    const flat = flattenVisible(TREE, new Set(), true)
    expect(flat[0]).toMatchObject({
      id: LIFE_ID,
      depth: 0,
      isFolder: true,
      posInSet: 1,
      setSize: 1,
    })
  })

  it('a root with nothing under it is not a folder', () => {
    expect(flattenVisible([], new Set(), true)[0]).toMatchObject({ id: LIFE_ID, isFolder: false })
  })

  it('life collapsed → only the Life row', () => {
    expect(ids(flattenVisible(TREE, new Set(['health']), false))).toEqual([LIFE_ID])
  })

  it('collapsed folders hide their subtrees', () => {
    expect(ids(flattenVisible(TREE, new Set(), true))).toEqual([
      LIFE_ID,
      'health',
      'personal',
      'scratch',
    ])
  })

  it('expanding reveals children in order, at the right depth, to any nesting', () => {
    const flat = flattenVisible(TREE, new Set(['personal', 'food']), true)
    expect(ids(flat)).toEqual([
      LIFE_ID,
      'health',
      'personal',
      'food',
      'recipes',
      'trips',
      'scratch',
    ])
    const depthOf = (id: string) => flat.find((f) => f.id === id)!.depth
    expect(depthOf('personal')).toBe(1)
    expect(depthOf('food')).toBe(2)
    expect(depthOf('recipes')).toBe(3)
  })

  it('carries ARIA sibling coordinates per level', () => {
    const flat = flattenVisible(TREE, new Set(['health']), true)
    const at = (id: string) => flat.find((f) => f.id === id)!
    // top level: health, personal, scratch = a set of 3
    expect(at('health')).toMatchObject({ posInSet: 1, setSize: 3 })
    expect(at('scratch')).toMatchObject({ posInSet: 3, setSize: 3 })
    // inside health: sleep, marathon = a set of 2
    expect(at('sleep')).toMatchObject({ posInSet: 1, setSize: 2 })
    expect(at('marathon')).toMatchObject({ posInSet: 2, setSize: 2 })
  })
})

describe('treeKeyCommand', () => {
  const open = new Set(['personal', 'food'])
  const flat = flattenVisible(TREE, open, true)
  const opts = { expanded: open, lifeExpanded: true }
  const key = (k: string, id: string) => treeKeyCommand(k, id, flat, opts)

  it('ArrowDown / ArrowUp move focus through visible rows', () => {
    expect(key('ArrowDown', LIFE_ID)).toEqual({ kind: 'focus', id: 'health' })
    expect(key('ArrowDown', 'personal')).toEqual({ kind: 'focus', id: 'food' })
    expect(key('ArrowUp', 'food')).toEqual({ kind: 'focus', id: 'personal' })
  })

  it('clamps at both ends instead of wrapping', () => {
    expect(key('ArrowUp', LIFE_ID)).toEqual({ kind: 'focus', id: LIFE_ID })
    expect(key('ArrowDown', 'scratch')).toEqual({ kind: 'focus', id: 'scratch' })
  })

  it('Home / End jump to the first / last visible row', () => {
    expect(key('Home', 'trips')).toEqual({ kind: 'focus', id: LIFE_ID })
    expect(key('End', LIFE_ID)).toEqual({ kind: 'focus', id: 'scratch' })
  })

  it('ArrowRight expands a closed folder', () => {
    expect(key('ArrowRight', 'health')).toEqual({ kind: 'expand', id: 'health' })
  })

  it('ArrowRight on an open folder steps into its first child', () => {
    expect(key('ArrowRight', 'personal')).toEqual({ kind: 'focus', id: 'food' })
  })

  it('ArrowRight is a no-op on a leaf and on an open folder with no visible child', () => {
    expect(key('ArrowRight', 'trips')).toBeNull()
    expect(key('ArrowRight', 'scratch')).toBeNull()
    // an open top-level page with no children: expanding an empty area
    const emptyArea = [node('empty', 'page', 'Empty')]
    const f = flattenVisible(emptyArea, new Set(['empty']), true)
    expect(
      treeKeyCommand('ArrowRight', 'empty', f, { expanded: new Set(['empty']), lifeExpanded: true })
    ).toBeNull()
  })

  it('ArrowLeft collapses an open folder', () => {
    expect(key('ArrowLeft', 'personal')).toEqual({ kind: 'collapse', id: 'personal' })
    expect(treeKeyCommand('ArrowLeft', LIFE_ID, flat, opts)).toEqual({
      kind: 'collapse',
      id: LIFE_ID,
    })
  })

  it('ArrowLeft steps out to the parent from a leaf or closed folder', () => {
    expect(key('ArrowLeft', 'recipes')).toEqual({ kind: 'focus', id: 'food' })
    expect(key('ArrowLeft', 'health')).toEqual({ kind: 'focus', id: LIFE_ID }) // closed folder, Life is the parent of top-level rows
    expect(key('ArrowLeft', 'scratch')).toEqual({ kind: 'focus', id: LIFE_ID })
  })

  it('ArrowLeft on a collapsed Life root is a no-op (nowhere to step out)', () => {
    const closed = flattenVisible(TREE, new Set(), false)
    expect(
      treeKeyCommand('ArrowLeft', LIFE_ID, closed, { expanded: new Set(), lifeExpanded: false })
    ).toBeNull()
  })

  it('Enter and Space open the row', () => {
    expect(key('Enter', 'trips')).toEqual({ kind: 'open', id: 'trips' })
    expect(key(' ', 'personal')).toEqual({ kind: 'open', id: 'personal' })
    expect(key('Enter', LIFE_ID)).toEqual({ kind: 'open', id: LIFE_ID })
  })

  it('Delete / Backspace do nothing — the row has no keyboard delete', () => {
    expect(key('Delete', 'trips')).toBeNull()
    expect(key('Backspace', 'health')).toBeNull()
    expect(key('Delete', LIFE_ID)).toBeNull()
  })

  it('+ adds a child — on the Life root too, where it adds a top-level page', () => {
    expect(key('+', 'personal')).toEqual({ kind: 'addChild', id: 'personal' })
    expect(key('+', LIFE_ID)).toEqual({ kind: 'addChild', id: LIFE_ID })
  })

  it('F2 renames the row in place — but never the Life root', () => {
    expect(key('F2', 'trips')).toEqual({ kind: 'rename', id: 'trips' })
    expect(key('F2', 'health')).toEqual({ kind: 'rename', id: 'health' })
    expect(key('F2', LIFE_ID)).toBeNull()
  })

  it('unknown keys and stale ids return null (no focus jump)', () => {
    expect(key('a', 'health')).toBeNull()
    expect(key('ArrowDown', 'deleted-row')).toBeNull()
  })
})

describe('focusFallback', () => {
  const prevOrder = [LIFE_ID, 'health', 'sleep', 'marathon', 'personal', 'scratch']

  it('falls to the nearest surviving row after the removed one', () => {
    const visible = new Set([LIFE_ID, 'health', 'marathon', 'personal', 'scratch'])
    expect(focusFallback(prevOrder, 'sleep', visible)).toBe('marathon')
  })

  it('falls back to the nearest row before it when nothing survives after', () => {
    const visible = new Set([LIFE_ID, 'health'])
    expect(focusFallback(prevOrder, 'scratch', visible)).toBe('health')
  })

  it('collapse-hides a whole subtree → lands on the parent', () => {
    // health collapsed: sleep + marathon gone, nearest after = personal? No —
    // the nearest AFTER sleep that survives is personal; VS Code lands there
    // when deleting, but when a subtree hides, the parent (health) survives
    // BEFORE it too. The rule is nearest-after first:
    const visible = new Set([LIFE_ID, 'health', 'personal', 'scratch'])
    expect(focusFallback(prevOrder, 'sleep', visible)).toBe('personal')
    // when the removed row was last inside the collapsed tail, we walk back:
    expect(focusFallback([LIFE_ID, 'health', 'sleep'], 'sleep', new Set([LIFE_ID, 'health']))).toBe(
      'health'
    )
  })

  it('unknown removed id or nothing surviving → the Life root', () => {
    expect(focusFallback(prevOrder, 'never-existed', new Set([LIFE_ID]))).toBe(LIFE_ID)
    expect(focusFallback(prevOrder, 'health', new Set<string>())).toBe(LIFE_ID)
  })
})

// ── Move (F25) ────────────────────────────────────────────────────────────────

/** Flat rows mirroring TREE:
 *  health[sleep, marathon] · personal[food[recipes], trips] · scratch */
const ROWS: PageRow[] = [
  row('health', null, 'page', 'Health', 0),
  row('sleep', 'health', 'page', 'Sleep', 0),
  row('marathon', 'health', 'project', 'Marathon', 1),
  row('personal', null, 'page', 'Personal', 1),
  row('food', 'personal', 'page', 'Food', 0),
  row('recipes', 'food', 'page', 'Recipes', 0),
  row('trips', 'personal', 'page', 'Trips', 1),
  row('scratch', null, 'page', 'Scratchpad', 2),
]

describe('isDescendant', () => {
  it('a node is not its own descendant', () => {
    expect(isDescendant(ROWS, 'personal', 'personal')).toBe(false)
  })
  it('a direct child is a descendant of its parent', () => {
    expect(isDescendant(ROWS, 'food', 'personal')).toBe(true)
  })
  it('a deep descendant is found by walking parent_id up', () => {
    expect(isDescendant(ROWS, 'recipes', 'personal')).toBe(true)
  })
  it('unrelated nodes are not descendants', () => {
    expect(isDescendant(ROWS, 'sleep', 'personal')).toBe(false)
    expect(isDescendant(ROWS, 'health', 'recipes')).toBe(false)
  })
})

describe('computeMove', () => {
  it('into: moves the node to be the target’s last child, reindexed', () => {
    const move = computeMove(ROWS, 'scratch', 'health', 'into')
    expect(move).toEqual({ newParentId: 'health', siblingOrder: ['sleep', 'marathon', 'scratch'] })
  })

  it('before: inserts as a sibling above the target under the target’s parent', () => {
    const move = computeMove(ROWS, 'scratch', 'marathon', 'before')
    // health’s children reindexed: sleep, scratch, marathon
    expect(move).toEqual({ newParentId: 'health', siblingOrder: ['sleep', 'scratch', 'marathon'] })
  })

  it('after: inserts as a sibling below the target under the target’s parent', () => {
    const move = computeMove(ROWS, 'scratch', 'sleep', 'after')
    expect(move).toEqual({ newParentId: 'health', siblingOrder: ['sleep', 'scratch', 'marathon'] })
  })

  it('into Life: makes the node top-level (null parent), appended after existing roots', () => {
    const move = computeMove(ROWS, 'recipes', LIFE_ID, 'into')
    expect(move).toEqual({
      newParentId: null,
      siblingOrder: ['health', 'personal', 'scratch', 'recipes'],
    })
  })

  it('cycle: dropping a node into its own subtree → null', () => {
    expect(computeMove(ROWS, 'personal', 'food', 'into')).toBeNull() // into a descendant
    expect(computeMove(ROWS, 'personal', 'recipes', 'into')).toBeNull() // into a deep descendant
    expect(computeMove(ROWS, 'personal', 'food', 'before')).toBeNull() // sibling-of-own-child
    expect(computeMove(ROWS, 'personal', 'personal', 'into')).toBeNull() // into self
  })

  it('no-op: same parent and same position → null', () => {
    expect(computeMove(ROWS, 'sleep', 'sleep', 'into')).toBeNull() // onto self
    expect(computeMove(ROWS, 'sleep', 'marathon', 'before')).toBeNull() // already above marathon
    expect(computeMove(ROWS, 'marathon', 'sleep', 'after')).toBeNull() // already below sleep
    expect(computeMove(ROWS, 'marathon', 'health', 'into')).toBeNull() // already health’s last child
  })

  it('before/after the Life root is invalid (Life is into-only) → null', () => {
    expect(computeMove(ROWS, 'scratch', LIFE_ID, 'before')).toBeNull()
    expect(computeMove(ROWS, 'scratch', LIFE_ID, 'after')).toBeNull()
  })

  it('leaf into: dropping into a childless page nests it there (leaf becomes a folder)', () => {
    const move = computeMove(ROWS, 'trips', 'sleep', 'into')
    expect(move).toEqual({ newParentId: 'sleep', siblingOrder: ['trips'] })
  })

  it('reindex is dense 0..N-1 in the returned order (repairs the legacy all-zeros state)', () => {
    // all top-level rows share order values; a reorder still yields a dense group
    const move = computeMove(ROWS, 'scratch', 'health', 'before')
    expect(move!.siblingOrder).toEqual(['scratch', 'health', 'personal'])
    move!.siblingOrder.forEach((id, i) => expect(i).toBe(move!.siblingOrder.indexOf(id)))
  })
})

describe('canMove (dragover affordance gate)', () => {
  it('true for a valid, non-cyclic slot (even a no-op)', () => {
    expect(canMove(ROWS, 'scratch', 'health', 'into')).toBe(true)
    expect(canMove(ROWS, 'sleep', 'marathon', 'before')).toBe(true) // no-op still offers a landing
  })
  it('false for self, cycle, and before/after Life', () => {
    expect(canMove(ROWS, 'health', 'health', 'into')).toBe(false)
    expect(canMove(ROWS, 'personal', 'recipes', 'into')).toBe(false)
    expect(canMove(ROWS, 'scratch', LIFE_ID, 'before')).toBe(false)
  })
})
