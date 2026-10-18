/**
 * The trash row (KAN-451): a reserved virtual page, the databases root's
 * SECOND child, directly after the change log row — same no-row, no-migration
 * shape as `changeLogRow` in `Rail.tsx`. It takes none of drag, drop, +,
 * Delete or F2 (`NO_CAPABILITIES`, the same object the databases foot row and
 * the change log row share): no delete ×, no F2/double-click rename.
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

function renderExpanded() {
  return render(
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

describe('rail — the trash row (KAN-451)', () => {
  it('renders directly after the change log row, once the databases root is expanded', () => {
    renderExpanded()
    const foot = screen.getByRole('tree', { name: 'Databases' })
    // KAN-486: the heading is the LAST row now (its own rows sit above it,
    // never below), so `change log`/`trash` lead the list rather than follow it.
    const rows = within(foot).getAllByRole('treeitem')
    expect(rows[0]).toHaveAccessibleName('change log')
    expect(rows[1]).toHaveAccessibleName('trash')
  })

  it('a pond with no databases root shows neither the row nor a dangling click target', () => {
    render(
      <RailView
        tree={[health]}
        pondName="life"
        selectedId={null}
        expanded={new Set()}
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
    const foot = screen.getByRole('tree', { name: 'Databases' })
    expect(within(foot).queryByRole('treeitem', { name: 'trash' })).not.toBeInTheDocument()
  })

  it('offers no mark/icon picker — there is no page behind it to write a mark to', () => {
    renderExpanded()
    const foot = screen.getByRole('tree', { name: 'Databases' })
    const row = within(foot).getByRole('treeitem', { name: 'trash' })
    expect(within(row).queryByRole('button', { name: 'change icon for trash' })).not.toBeInTheDocument()
  })

  it('is not draggable', () => {
    renderExpanded()
    const foot = screen.getByRole('tree', { name: 'Databases' })
    const row = within(foot).getByRole('treeitem', { name: 'trash' })
    expect(row).toHaveAttribute('draggable', 'false')
  })

  it('takes none of +, Delete or F2 — no delete ×, no F2/double-click rename', () => {
    const { onAddChild, onDelete } = (() => {
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
      return { onAddChild, onDelete }
    })()
    const foot = screen.getByRole('tree', { name: 'Databases' })
    const row = within(foot).getByRole('treeitem', { name: 'trash' })
    fireEvent.keyDown(row, { key: '+' })
    fireEvent.keyDown(row, { key: 'Delete' })
    fireEvent.keyDown(row, { key: 'F2' })
    fireEvent.doubleClick(row)
    expect(onAddChild).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(within(foot).queryByRole('textbox')).not.toBeInTheDocument()
  })
})
