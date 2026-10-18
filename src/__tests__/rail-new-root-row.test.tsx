/**
 * KAN-490: the ＋ "new root folder" row sits at depth 0 after the last root,
 * above the databases foot. Unlike every other row's tools, it is always at
 * rest — no hover or focus needed to see it — and it is a real `<button>`
 * reached by Tab, not a treeitem on the tree's roving arrow-key focus.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

function renderRail(tree: RailNode[]) {
  return render(
    <RailView
      tree={tree}
      pondName="life"
      selectedId={null}
      expanded={new Set()}
      lifeExpanded={false}
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

describe('rail — the ＋ new-root-folder row', () => {
  it('renders at rest, with no hover or focus simulated', () => {
    renderRail([])

    const row = screen.getByRole('button', { name: 'new root folder' })
    expect(row).toBeVisible()
  })

  it('is a real button, reachable by Tab — not a treeitem', () => {
    renderRail([])

    const row = screen.getByRole('button', { name: 'new root folder' })
    expect(row.tagName).toBe('BUTTON')
    expect(row).not.toHaveAttribute('role', 'treeitem')
    expect(row).not.toHaveAttribute('tabindex', '-1')
  })

  it('does not render while the rail is loading', () => {
    render(
      <RailView
        tree={[]}
        pondName="life"
        selectedId={null}
        expanded={new Set()}
        lifeExpanded={false}
        busyId={null}
        isLoading
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

    expect(screen.queryByRole('button', { name: 'new root folder' })).not.toBeInTheDocument()
  })
})
