/**
 * KAN-122: the rail's row-note slot — a non-shared `new` note for a nested
 * page not yet opened (`props.nestedFrom` set, `props.openedAt` absent).
 * Disappears once `openedAt` lands (6k frame 3's rail has no note).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const node = (
  id: string,
  title: string,
  props: RailNode['props'] = undefined,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children, props })

function renderRail(tree: RailNode[]) {
  return render(
    <RailView
      tree={tree}
      pondName="life"
      selectedId={null}
      expanded={new Set(['kitchen'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onSelect={jest.fn()}
      onToggle={jest.fn()}
      onAddChild={jest.fn()}
      onDelete={jest.fn()}
      onRename={jest.fn()}
      onPickGlyph={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
    />
  )
}

describe('Rail row-note (KAN-122)', () => {
  it('a flagged row renders the `new` note', () => {
    const tree: RailNode[] = [
      node('kitchen', 'Kitchen renovation', null, [
        node('cabinets', 'Cabinets', { nestedFrom: 'kitchen' }),
      ]),
    ]
    renderRail(tree)
    const row = screen.getByRole('treeitem', { name: /Cabinets/ })
    expect(within(row).getByText('new')).toBeInTheDocument()
  })

  it('an unflagged row renders no note', () => {
    const tree: RailNode[] = [
      node('kitchen', 'Kitchen renovation', null, [
        node('cabinets', 'Cabinets', { nestedFrom: 'kitchen', openedAt: '2026-10-17T00:00:00Z' }),
      ]),
    ]
    renderRail(tree)
    const row = screen.getByRole('treeitem', { name: 'Cabinets' })
    expect(within(row).queryByText('new')).not.toBeInTheDocument()
  })

  it('a row with no nested-page stamp renders no note', () => {
    const tree: RailNode[] = [node('kitchen', 'Kitchen renovation', null)]
    renderRail(tree)
    const row = screen.getByRole('treeitem', { name: 'Kitchen renovation' })
    expect(within(row).queryByText('new')).not.toBeInTheDocument()
  })
})
