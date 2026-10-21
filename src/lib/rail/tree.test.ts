/**
 * Unit tests for the extra-roots split (KAN-490/491) — pure logic, no fixtures
 * beyond hand-built `RailNode`s.
 */

import { isExtraRootNode, splitExtraRoots, type RailNode } from './tree'

const node = (overrides: Partial<RailNode>): RailNode => ({
  id: 'id',
  parentId: null,
  type: 'page',
  title: 'title',
  order: 0,
  children: [],
  ...overrides,
})

describe('splitExtraRoots', () => {
  it('treats every top-level node as an ordinary child when none carry props.root', () => {
    const roots = [node({ id: 'life-child-1' }), node({ id: 'life-child-2' })]
    expect(splitExtraRoots(roots)).toEqual({ children: roots, extraRoots: [] })
  })

  it('lifts out a single extra root', () => {
    const child = node({ id: 'child' })
    const extra = node({ id: 'extra', props: { root: true } })
    expect(splitExtraRoots([child, extra])).toEqual({
      children: [child],
      extraRoots: [extra],
    })
  })

  it('lifts out several extra roots, preserving order on both sides', () => {
    const a = node({ id: 'a' })
    const extra1 = node({ id: 'extra1', props: { root: true } })
    const b = node({ id: 'b' })
    const extra2 = node({ id: 'extra2', props: { root: true } })
    expect(splitExtraRoots([a, extra1, b, extra2])).toEqual({
      children: [a, b],
      extraRoots: [extra1, extra2],
    })
  })

  it('keeps an extra root with children intact, children and all', () => {
    const grandchild = node({ id: 'grandchild', parentId: 'extra' })
    const extra = node({ id: 'extra', props: { root: true }, children: [grandchild] })
    expect(splitExtraRoots([extra])).toEqual({ children: [], extraRoots: [extra] })
  })

  it('never treats a node with props.root but a non-null parentId as a root', () => {
    const reparented = node({ id: 'reparented', parentId: 'some-folder', props: { root: true } })
    expect(isExtraRootNode(reparented)).toBe(false)
    expect(splitExtraRoots([reparented])).toEqual({ children: [reparented], extraRoots: [] })
  })
})
