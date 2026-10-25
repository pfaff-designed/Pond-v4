/**
 * KAN-474 fix: once a rail row is a real `<a href>`, a click on an interactive
 * descendant (caret, ＋, ×, the mark button) must never let the anchor's own
 * default action (navigate) fire — `stopPropagation` alone keeps the click from
 * reaching `handleRowClick`, but leaves the browser's native navigation armed.
 */
import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
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

function renderTree() {
  const onSelect = jest.fn()
  const onToggle = jest.fn()
  const onDelete = jest.fn()
  render(
    <RailView
      tree={TREE}
      pondName="life"
      selectedId="health"
      expanded={new Set(['health'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onSelect={onSelect}
      onToggle={onToggle}
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
  return { onSelect, onToggle, onDelete }
}

describe('rail row — interactive descendants never navigate the anchor (KAN-474)', () => {
  it('the caret click is prevented and never selects the row', () => {
    const { onSelect, onToggle } = renderTree()
    const row = screen.getByRole('treeitem', { name: 'Health' })
    // aria-hidden (decorative to a screen reader; the row itself carries the
    // expanded state) — excluded from the accessible tree by default.
    const caret = within(row).getAllByRole('button', { hidden: true })[0]

    const notPrevented = fireEvent.click(caret)

    expect(notPrevented).toBe(false) // preventDefault() WAS called
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggle).toHaveBeenCalledWith('health')
  })

  it('the ＋ click is prevented and never selects the row', () => {
    const { onSelect } = renderTree()
    const row = screen.getByRole('treeitem', { name: 'Health' })
    const plus = within(row).getByRole('button', { name: /Add sub-page/ })

    const notPrevented = fireEvent.click(plus)

    expect(notPrevented).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('the × click is prevented, never selects the row, and still deletes', () => {
    const { onSelect, onDelete } = renderTree()
    const row = screen.getByRole('treeitem', { name: 'Health' })
    const deleteButton = within(row).getByRole('button', { name: /Delete/ })

    const notPrevented = fireEvent.click(deleteButton)

    expect(notPrevented).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith('health')
  })

  it('the mark button click is prevented and selects the row exactly once (its own handler, not the anchor)', () => {
    const { onSelect } = renderTree()
    const row = screen.getByRole('treeitem', { name: 'Health' })
    const markButton = within(row).getByRole('button', { name: /change icon/ })

    const notPrevented = fireEvent.click(markButton)

    expect(notPrevented).toBe(false) // preventDefault() WAS called — no native navigation
    // The mark button's own handler selects the row deliberately when it opens the
    // picker (6y frame 1) — a SECOND call here would mean the click also reached the
    // anchor's own `handleRowClick`, i.e. `stopPropagation` stopped working.
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('health')
  })
})
