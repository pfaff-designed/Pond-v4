/**
 * KAN-471: an empty pond's root row shows its ＋ at rest (Notion/Linear show
 * their create affordance without a hover), since hover-only buried the thing
 * the "no pages yet" hint names. Once a page exists, the hover-only rule
 * returns — this is a flow override of the `PondRail` `empty` state, not a
 * new value (reuses the existing hover opacity classes).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

function renderRail(
  tree: RailNode[],
  isEmpty: boolean,
  selectedId: string | null = null,
  showHomeRoot = true
) {
  return render(
    <RailView
      tree={tree}
      pondName="life"
      showHomeRoot={showHomeRoot}
      selectedId={selectedId}
      expanded={new Set()}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={isEmpty}
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

function plusWrapperClassName(rootRow: HTMLElement): string {
  const plusButton = within(rootRow).getByRole('button', { name: /Add sub-page/ })
  return plusButton.parentElement!.className
}

describe('rail — the root row\'s ＋ while the pond has no pages (KAN-471)', () => {
  it('draws at rest, with no hover simulated, while the pond is empty', () => {
    renderRail([], true)

    const rootRow = screen.getByRole('treeitem', { name: 'life' })
    const className = plusWrapperClassName(rootRow)
    expect(className).toContain('opacity-100')
    expect(className).toContain('pointer-events-auto')
  })

  it('goes back to hover-only at rest once a page exists', () => {
    const tree: RailNode[] = [
      { id: 'health', parentId: null, type: 'page', title: 'Health', order: 0, children: [] },
    ]
    // Selects the page rather than leaving `selectedId` null, so the root
    // itself is unselected and its ＋ reflects the hover-only rest state,
    // not the lone-selected-root's own unconditional ＋.
    renderRail(tree, false, 'health')

    const rootRow = screen.getByRole('treeitem', { name: 'life' })
    const className = plusWrapperClassName(rootRow)
    expect(className).toContain('opacity-0')
    expect(className).toContain('pointer-events-none')
  })

  it('names the now-visible ＋ in the "no pages yet" hint', () => {
    renderRail([], true)

    expect(screen.getByRole('status')).toHaveTextContent('no pages yet. the ＋ above makes one')
  })

  it('hides the hint while the root row (and its ＋) is hidden, e.g. mid delete-undo', () => {
    renderRail([], true, null, false)

    expect(screen.queryByRole('treeitem', { name: 'life' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
