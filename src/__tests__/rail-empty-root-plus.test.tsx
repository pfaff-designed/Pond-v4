/**
 * KAN-471: an empty pond's root row shows its ＋ at rest (Notion/Linear show
 * their create affordance without a hover), since hover-only buried the thing
 * the "no pages yet" hint names. Once a page exists, the hover-only rule
 * returns — this is a flow override of the `PondRail` `empty` state, not a
 * new value (reuses the existing hover opacity classes).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function labelWrapClasses(rootRow: HTMLElement): string[] {
  return rootRow.querySelector('[data-kind="list-row"]')!.className.split(/\s+/)
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

  it('names the root row\'s own label in the "no pages yet" hint', () => {
    renderRail([], true)

    expect(screen.getByRole('status')).toHaveTextContent('no pages yet. the ＋ beside life makes one')
  })

  it('shifts the resting ＋ to its hover position, so it never moves under the cursor', () => {
    renderRail([], true)

    const rootRow = screen.getByRole('treeitem', { name: 'life' })
    const className = plusWrapperClassName(rootRow)
    // The class that moves the ＋ out from under the ×'s slot on hover
    // ('mr-5') must already be present at rest, not added by hover alone —
    // otherwise the visible resting ＋ sits in the ×'s box.
    expect(className).toContain('mr-5')
  })

  it('hides the hint while the root row (and its ＋) is hidden, e.g. mid delete-undo', () => {
    renderRail([], true, null, false)

    expect(screen.queryByRole('treeitem', { name: 'life' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('narrows the label for the resting ＋ the same way it narrows for a hovered one', async () => {
    renderRail([], true)

    const rootRow = screen.getByRole('treeitem', { name: 'life' })
    // The unconditional `group-focus-within:pr-[39px]` token is excluded by the
    // exact-match check below — the plain `pr-[39px]` token must be present on
    // its own, carried by `toolsPad`, not just by the keyboard-focus class.
    expect(labelWrapClasses(rootRow)).toContain('pr-[39px]')

    await userEvent.hover(rootRow)
    expect(labelWrapClasses(rootRow)).toContain('pr-[39px]')
  })

  it('does not open the rename textbox on a double-click of the resting ＋', async () => {
    renderRail([], true)

    const rootRow = screen.getByRole('treeitem', { name: 'life' })
    const plusButton = within(rootRow).getByRole('button', { name: /Add sub-page/ })
    await userEvent.dblClick(plusButton)

    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
