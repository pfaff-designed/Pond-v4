/**
 * KAN-314 item 2: the open (selected) row's × deletes to trash with exactly
 * one click and no row click first — hovering the row (which is already
 * selected, not clicked) then a single click on × must fire the delete
 * callback once.
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

const TREE: RailNode[] = [node('health', 'Health', [node('sleep', 'Sleep', [], 'health')])]

describe('Rail open row × — single click, no row click first (KAN-314 case 1)', () => {
  it('hover then one click on × deletes the selected row, calling onDelete exactly once', async () => {
    const user = userEvent.setup()
    const onDelete = jest.fn()
    const onSelect = jest.fn()

    render(
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
        onAddChild={jest.fn()}
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

    const row = screen.getByRole('treeitem', { name: 'Sleep' })
    await user.hover(row)
    const deleteButton = within(row).getByRole('button', { name: /Delete/ })
    await user.click(deleteButton)

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith('sleep')
    // The row was already selected via the `selectedId` prop, never clicked.
    expect(onSelect).not.toHaveBeenCalled()
    // The × click must never land on ＋'s menu instead (KAN-320).
    expect(screen.queryByRole('menu', { name: 'new page menu' })).not.toBeInTheDocument()
  })
})
