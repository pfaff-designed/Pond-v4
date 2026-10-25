/**
 * KAN-474 fix: a rail row's `href` used `workspaceUrl(node)` during render, and
 * `workspaceUrl`'s default pond comes from `currentPondId()`, which reads
 * `window.location` and returns null on the server. A server-rendered row (the
 * trash row, rendered before any pond data loads) got an href WITHOUT `&pond=`;
 * the client then computed one WITH it, and React reported a hydration
 * mismatch it won't patch up — the stale pond-less href stuck, so ⌘-click /
 * middle-click "trash" in a second pond opened the first pond's trash.
 *
 * The fix passes the pond id explicitly (`workspaceUrl(node, pondId)`), read
 * from the pond context rather than `window.location`, so first render and
 * every render after agree.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import { TRASH_NODE_ID } from '@/lib/change-log/trash-view'
import { workspaceUrl } from '@/lib/pages/nav'

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

function renderRail(pondId: string | null) {
  render(
    <RailView
      tree={[health]}
      pondId={pondId}
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
}

describe('rail row href — the pond id is passed explicitly, never read from window (KAN-474)', () => {
  beforeEach(() => {
    // Simulates the server's address, which carries no `?pond=` at all —
    // the condition the bug needed: a `window` with no pond param while the
    // real pond is known some other way (here, the `pondId` prop).
    window.history.replaceState({}, '', '/workspace')
  })

  it('a pond context of p2 and a window URL without ?pond still gives href containing pond=p2', () => {
    renderRail('p2')
    const trashRow = screen.getByRole('treeitem', { name: 'trash' })
    expect(trashRow).toHaveAttribute(
      'href',
      workspaceUrl({ id: TRASH_NODE_ID, type: 'page', title: 'trash' }, 'p2')
    )
    expect(trashRow.getAttribute('href')).toContain('pond=p2')
  })

  it('an ordinary row carries the same explicit pond, not the window-derived one', () => {
    renderRail('p2')
    const row = screen.getByRole('treeitem', { name: 'Health' })
    expect(row).toHaveAttribute(
      'href',
      workspaceUrl({ id: 'health', type: 'page', title: 'Health' }, 'p2')
    )
  })

  it('falls back to no &pond= when no pond id is known at all (pre-existing behaviour)', () => {
    renderRail(null)
    const trashRow = screen.getByRole('treeitem', { name: 'trash' })
    expect(trashRow.getAttribute('href')).not.toContain('pond=')
  })
})
