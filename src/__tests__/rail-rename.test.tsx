/**
 * The rail's inline rename (KAN-21, `PondRail` `renaming`): F2 / double-click turns
 * a row's label into a field in place; ↵ keeps, esc cancels, blur keeps; empty or
 * unchanged keeps the old title. The pond root and the databases foot row are
 * system roots and never rename from here.
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

const creativity = node('creativity', 'creativity', [
  node('books', 'books', [], 'creativity'),
  node('recipes', 'recipes', [], 'creativity', 1),
])
const scratch = node('scratch', 'scratch', [], null, 1)
const databases = node('root-db', 'databases', [], null, 9)

function setup(tree: RailNode[] = [creativity, scratch, databases]) {
  const handlers = {
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onAddChild: jest.fn(),
    onSelect: jest.fn(),
  }
  const view = (nextTree: RailNode[]) => (
    <RailView
      tree={nextTree}
      pondName="life"
      selectedId={null}
      expanded={new Set(['creativity'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onToggle={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
      {...handlers}
    />
  )
  const utils = render(view(tree))
  return { ...utils, ...handlers, rerenderTree: (next: RailNode[]) => utils.rerender(view(next)) }
}

const row = (name: string) => screen.getByRole('treeitem', { name })

const startRename = (name: string) => {
  const target = row(name)
  target.focus()
  fireEvent.keyDown(target, { key: 'F2' })
  return screen.getByRole('textbox', { name: `rename ${name}` })
}

describe('rail — aria-expanded', () => {
  it('a childless top-level row sets none; a row with children sets it', () => {
    setup()
    expect(row('scratch')).not.toHaveAttribute('aria-expanded')
    expect(row('creativity')).toHaveAttribute('aria-expanded', 'true')
    expect(row('books')).not.toHaveAttribute('aria-expanded')
  })
})

describe('rail — inline rename', () => {
  it('F2 turns the label into a focused, selected field; the treeitem keeps its role', () => {
    setup()
    const field = startRename('books')
    expect(field).toHaveValue('books')
    expect(field).toHaveFocus()
    expect((field as HTMLInputElement).selectionStart).toBe(0)
    expect((field as HTMLInputElement).selectionEnd).toBe(5)
    expect(within(row('books')).getByRole('textbox')).toBe(field)
  })

  it('double-click starts it too', () => {
    setup()
    fireEvent.doubleClick(row('books'))
    expect(screen.getByRole('textbox', { name: 'rename books' })).toHaveFocus()
  })

  it('↵ keeps the trimmed title and hands focus back to the row', () => {
    const { onRename } = setup()
    const field = startRename('books')
    fireEvent.change(field, { target: { value: '  reading  ' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('books', 'reading')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(row('books')).toHaveFocus()
  })

  it('esc cancels: nothing is written and the row has focus', () => {
    const { onRename } = setup()
    const field = startRename('books')
    fireEvent.change(field, { target: { value: 'reading' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(row('books')).toHaveFocus()
  })

  it('blur keeps, and does not pull focus back from wherever the person went', () => {
    const { onRename } = setup()
    const field = startRename('books')
    fireEvent.change(field, { target: { value: 'reading' } })
    fireEvent.blur(field)
    expect(onRename).toHaveBeenCalledWith('books', 'reading')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(row('books')).not.toHaveFocus()
  })

  it.each(['', '   '])('keeping %p keeps the old title', (value) => {
    const { onRename } = setup()
    const field = startRename('books')
    fireEvent.change(field, { target: { value } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
    expect(row('books')).toHaveTextContent('books')
  })

  it('an unchanged title writes nothing', () => {
    const { onRename } = setup()
    const field = startRename('books')
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('settles once: ↵ followed by the blur the unmount raises writes a single time', () => {
    const { onRename } = setup()
    const field = startRename('books')
    fireEvent.change(field, { target: { value: 'reading' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it('hides the row tools while renaming', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Add sub-page to books' })).toBeInTheDocument()
    startRename('books')
    expect(screen.queryByRole('button', { name: 'Add sub-page to books' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete books' })).not.toBeInTheDocument()
  })

  it('keys typed into the field are the field’s, not the tree’s', () => {
    const { onDelete, onAddChild, onSelect } = setup()
    const field = startRename('books')
    for (const key of ['Delete', 'Backspace', '+', 'ArrowDown', 'ArrowLeft', 'Home', ' ', 'r']) {
      fireEvent.keyDown(field, { key })
    }
    expect(onDelete).not.toHaveBeenCalled()
    expect(onAddChild).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(field).toBeInTheDocument()
    expect(field).toHaveFocus()
  })

  it('clicking inside the field edits; it does not open the page', () => {
    const { onSelect } = setup()
    fireEvent.click(startRename('books'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a refetch while the field is open does not steal its focus', () => {
    const { rerenderTree } = setup()
    const field = startRename('books')
    fireEvent.change(field, { target: { value: 'read' } })
    rerenderTree([{ ...creativity }, { ...scratch }, { ...databases }])
    expect(screen.getByRole('textbox', { name: 'rename books' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'rename books' })).toHaveValue('read')
  })

  it('only one row renames at a time', () => {
    setup()
    startRename('books')
    fireEvent.keyDown(row('recipes'), { key: 'F2' })
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it('the pond root and the databases foot row never rename', () => {
    setup()
    for (const name of ['life', 'databases']) {
      fireEvent.keyDown(row(name), { key: 'F2' })
      fireEvent.doubleClick(row(name))
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('the databases placeholder row (no root yet) never renames', () => {
    setup([creativity])
    fireEvent.keyDown(row('databases'), { key: 'F2' })
    fireEvent.doubleClick(row('databases'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
