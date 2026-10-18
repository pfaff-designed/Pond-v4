/**
 * The trash row (KAN-504): the rail foot's own top-level row, below the
 * databases section and above `settings` — not a databases child any more
 * (KAN-451 put it inside databases; this moves it out). Its own `role="tree"`
 * landmark, always visible — with no databases root at all, and while
 * databases is collapsed. It takes none of drag, drop, +, Delete or F2
 * (`NO_CAPABILITIES`, the same object the databases foot row and the change
 * log row share): no delete ×, no F2/double-click rename.
 */
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

function renderRail(tree: RailNode[], expanded: Set<string>) {
  return render(
    <RailView
      tree={tree}
      pondName="life"
      selectedId={null}
      expanded={expanded}
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

describe('rail — the trash row (KAN-504)', () => {
  it('is its own top-level tree, not nested inside the Databases tree', () => {
    renderRail([health, databases], new Set(['root-db']))
    const trashTree = screen.getByRole('tree', { name: 'Trash' })
    expect(within(trashTree).getByRole('treeitem', { name: 'trash' })).toBeInTheDocument()
    const databasesTree = screen.getByRole('tree', { name: 'Databases' })
    expect(within(databasesTree).queryByRole('treeitem', { name: 'trash' })).not.toBeInTheDocument()
  })

  it('is visible with no databases root at all', () => {
    renderRail([health], new Set())
    expect(screen.getByRole('tree', { name: 'Trash' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'trash' })).toBeInTheDocument()
  })

  it('is visible while databases is collapsed', () => {
    renderRail([health, databases], new Set())
    expect(screen.getByRole('treeitem', { name: 'trash' })).toBeInTheDocument()
  })

  it('offers no mark/icon picker — there is no page behind it to write a mark to', () => {
    renderRail([health, databases], new Set(['root-db']))
    const row = screen.getByRole('treeitem', { name: 'trash' })
    expect(within(row).queryByRole('button', { name: 'change icon for trash' })).not.toBeInTheDocument()
  })

  it('is not draggable', () => {
    renderRail([health, databases], new Set(['root-db']))
    const row = screen.getByRole('treeitem', { name: 'trash' })
    expect(row).toHaveAttribute('draggable', 'false')
  })

  it('takes none of +, Delete or F2 — no delete ×, no F2/double-click rename', () => {
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
    const row = screen.getByRole('treeitem', { name: 'trash' })
    fireEvent.keyDown(row, { key: '+' })
    fireEvent.keyDown(row, { key: 'Delete' })
    fireEvent.keyDown(row, { key: 'F2' })
    fireEvent.doubleClick(row)
    expect(onAddChild).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
