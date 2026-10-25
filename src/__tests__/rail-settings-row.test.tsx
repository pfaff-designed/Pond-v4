/**
 * The settings row (KAN-493): the rail foot's own last row, below trash —
 * a real, keyboard-reachable control, not the dead text it used to be
 * (KAN-74). Same reserved-virtual shape as the trash row (KAN-504): its own
 * `role="tree"` landmark, always visible, takes none of drag, drop, +,
 * Delete or F2 (`NO_CAPABILITIES`).
 */
import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

const health = node('health', 'Health')
const databases = node('root-db', 'databases', [node('db-1', 'ingredients', [], 'root-db')], null, 9)

function renderRail(tree: RailNode[], expanded: Set<string>, onSelect = jest.fn()) {
  return {
    onSelect,
    ...render(
      <RailView
        tree={tree}
        pondName="life"
        selectedId={null}
        expanded={expanded}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={onSelect}
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
    ),
  }
}

describe('rail — the settings row (KAN-493)', () => {
  it('is its own top-level tree, below trash', () => {
    renderRail([health, databases], new Set(['root-db']))
    const settingsTree = screen.getByRole('tree', { name: 'Settings' })
    expect(within(settingsTree).getByRole('treeitem', { name: 'settings' })).toBeInTheDocument()
    const trashTree = screen.getByRole('tree', { name: 'Trash' })
    expect(
      trashTree.compareDocumentPosition(settingsTree) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('is visible with no databases root at all', () => {
    renderRail([health], new Set())
    expect(screen.getByRole('tree', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'settings' })).toBeInTheDocument()
  })

  it('offers no mark/icon picker — there is no page behind it to write a mark to', () => {
    renderRail([health, databases], new Set(['root-db']))
    const row = screen.getByRole('treeitem', { name: 'settings' })
    expect(
      within(row).queryByRole('button', { name: 'change icon for settings' })
    ).not.toBeInTheDocument()
  })

  it('is not draggable and takes none of +, Delete or F2', () => {
    const onAddChild = jest.fn()
    const onDelete = jest.fn()
    render(
      <RailView
        tree={[health, databases]}
        pondName="life"
        selectedId={null}
        expanded={new Set(['root-db'])}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={jest.fn()}
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
    const row = screen.getByRole('treeitem', { name: 'settings' })
    expect(row).toHaveAttribute('draggable', 'false')
    fireEvent.keyDown(row, { key: '+' })
    fireEvent.keyDown(row, { key: 'Delete' })
    fireEvent.keyDown(row, { key: 'F2' })
    fireEvent.doubleClick(row)
    expect(onAddChild).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('is focusable and clickable: a click selects it', () => {
    const onSelect = jest.fn()
    renderRail([health, databases], new Set(['root-db']), onSelect)
    const row = screen.getByRole('treeitem', { name: 'settings' })
    expect(row).toHaveAttribute('tabindex')
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith('__settings__')
  })

  it('keyboard: ↓ from trash reaches settings, ↑ returns, Enter navigates', () => {
    const onSelect = jest.fn()
    renderRail([health, databases], new Set(['root-db']), onSelect)
    const trashRow = screen.getByRole('treeitem', { name: 'trash' })
    const settingsRow = screen.getByRole('treeitem', { name: 'settings' })
    act(() => trashRow.focus())
    fireEvent.keyDown(trashRow, { key: 'ArrowDown' })
    expect(settingsRow).toHaveFocus()
    fireEvent.keyDown(settingsRow, { key: 'ArrowUp' })
    expect(trashRow).toHaveFocus()
    fireEvent.keyDown(settingsRow, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('__settings__')
  })
})
