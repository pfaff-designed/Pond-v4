/**
 * The databases root in the rail (#101 AC3, `Pond 03 Concepts` 3c: "two roots:
 * life for reading, databases for data"; PondRail draws it at the rail's foot,
 * after the Life tree). A database made from a list is filed under that root, so
 * this pins where the root renders: out of the Life tree, in its own foot tree,
 * with its databases nested under it — and nothing at all when the pond has none.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

const health = node('health', 'Health', [node('sleep', 'Sleep', [], 'health')])
const databases = node(
  'root-db',
  'Databases',
  [node('db-1', 'ingredients', [], 'root-db')],
  null,
  9
)

function renderRail(tree: RailNode[], expanded = new Set<string>()) {
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
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onNewPage={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
    />
  )
}

describe('rail — the databases root', () => {
  it('renders the databases root in its own foot tree, not among the Life areas', () => {
    renderRail([health, databases])
    const life = screen.getByRole('tree', { name: 'Workspace' })
    expect(within(life).getByText('Health')).toBeInTheDocument()
    expect(within(life).queryByText('Databases')).not.toBeInTheDocument()

    const foot = screen.getByRole('tree', { name: 'Databases' })
    expect(within(foot).getByText('Databases')).toBeInTheDocument()
  })

  it('lists a database under the root when it is expanded (the new database appears under databases)', () => {
    renderRail([health, databases], new Set(['root-db']))
    const foot = screen.getByRole('tree', { name: 'Databases' })
    expect(within(foot).getByText('ingredients')).toBeInTheDocument()
  })

  it('draws no databases tree until the pond has one to list', () => {
    renderRail([health])
    expect(screen.queryByRole('tree', { name: 'Databases' })).not.toBeInTheDocument()
  })
})
