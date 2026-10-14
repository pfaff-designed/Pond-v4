/**
 * KAN-314 item 3: a non-open row's × behaves the same as the open row's (no
 * click on the row first — hover then one click on × deletes it), and ＋
 * still opens the new-page menu on both the selected and a hovered,
 * non-selected row after the slot refactor.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

const TREE: RailNode[] = [
  node('health', 'Health', [
    node('sleep', 'Sleep', [], 'health', 0),
    node('exercise', 'Exercise', [], 'health', 1),
  ]),
]

function renderRail(onDelete: jest.Mock, onSelect: jest.Mock, onAddChild: jest.Mock) {
  return render(
    <RailView
      tree={TREE}
      pondName="life"
      selectedId="sleep"
      expanded={new Set(['health'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onSelect={onSelect}
      onToggle={jest.fn()}
      onAddChild={onAddChild}
      onDelete={onDelete}
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

describe('Rail non-open row × — single click, no row click first (KAN-314 case 2)', () => {
  it('hover then one click on × deletes a non-selected sibling row, calling onDelete exactly once', async () => {
    const user = userEvent.setup()
    const onDelete = jest.fn()
    const onSelect = jest.fn()
    renderRail(onDelete, onSelect, jest.fn())

    const row = screen.getByRole('treeitem', { name: 'Exercise' })
    await user.hover(row)
    const deleteButton = within(row).getByRole('button', { name: /Delete/ })
    await user.click(deleteButton)

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith('exercise')
    // × never clicked the row itself, open or not.
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('Rail ＋ still opens its menu after the slot refactor (KAN-314)', () => {
  it("opens the new-page menu from the selected row's ＋ (showPlus from isSelected, no hover needed)", async () => {
    const user = userEvent.setup()
    const onAddChild = jest.fn()
    renderRail(jest.fn(), jest.fn(), onAddChild)

    const row = screen.getByRole('treeitem', { name: 'Sleep' })
    await user.click(within(row).getByRole('button', { name: /Add sub-page/ }))

    const menu = await screen.findByRole('menu', { name: 'new page menu' })
    await user.click(within(menu).getByRole('menuitem', { name: /^page/ }))

    expect(onAddChild).toHaveBeenCalledTimes(1)
    expect(onAddChild).toHaveBeenCalledWith('sleep', 'page')
  })

  it("opens the new-page menu from a hovered, non-selected row's ＋ (showPlus from hover)", async () => {
    const user = userEvent.setup()
    const onAddChild = jest.fn()
    renderRail(jest.fn(), jest.fn(), onAddChild)

    const row = screen.getByRole('treeitem', { name: 'Exercise' })
    await user.hover(row)
    await user.click(within(row).getByRole('button', { name: /Add sub-page/ }))

    const menu = await screen.findByRole('menu', { name: 'new page menu' })
    await user.click(within(menu).getByRole('menuitem', { name: /^page/ }))

    expect(onAddChild).toHaveBeenCalledTimes(1)
    expect(onAddChild).toHaveBeenCalledWith('exercise', 'page')
  })
})
