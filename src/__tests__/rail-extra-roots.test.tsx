/**
 * KAN-490/491: a page with `props.root === true` is an EXTRA root — lifted out
 * of Life's own children and drawn at depth 0, after Life's flattened rows and
 * before the databases foot, the same trick `databasesFlat` already uses for
 * the databases root. Unlike Life, an extra root is never gated by Life's own
 * collapse, and it is never draggable (a drop must not leave `props.root` on a
 * page with a parent).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0,
  props?: Record<string, unknown>
): RailNode => ({ id, parentId, type: 'page', title, order, children, props })

function renderRail(tree: RailNode[], expanded: Set<string>, lifeExpanded: boolean) {
  return render(
    <RailView
      tree={tree}
      pondName="life"
      selectedId={null}
      expanded={expanded}
      lifeExpanded={lifeExpanded}
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

describe('rail — extra roots (props.root)', () => {
  it('renders an extra root and its child at depth 0 even while Life is collapsed, and never draggable', () => {
    const health = node('health', 'Health')
    const project = node('proj-1', 'Project', [], 'clients')
    const clients = node('clients', 'Clients', [project], null, 1, { root: true })

    renderRail([health, clients], new Set(['clients']), false)

    const workspace = screen.getByRole('tree', { name: 'Workspace' })

    // Life itself is collapsed: its own child never renders.
    expect(within(workspace).queryByText('Health')).not.toBeInTheDocument()

    // The extra root renders at depth 0 (aria-level 1) regardless.
    const extraRoot = within(workspace).getByRole('treeitem', { name: 'Clients' })
    expect(extraRoot).toHaveAttribute('aria-level', '1')
    expect(extraRoot).toHaveAttribute('draggable', 'false')

    // Its own child renders too, since the extra root is expanded on its own.
    expect(within(workspace).getByText('Project')).toBeInTheDocument()
  })

  it('an extra root with no children of its own carries no caret', () => {
    const clients = node('clients', 'Clients', [], null, 1, { root: true })

    renderRail([clients], new Set(), true)

    const extraRoot = screen.getByRole('treeitem', { name: 'Clients' })
    expect(extraRoot).not.toHaveAttribute('aria-expanded')
  })
})
