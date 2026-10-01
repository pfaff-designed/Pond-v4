/**
 * The databases root in the CHROME (#101 AC3, `Pond 03 Concepts` 3c: "two roots:
 * life for reading, databases for data" — peers, one beside the other).
 *
 *  - the rail (PondRail draws it at the foot, after the Life tree): out of the Life
 *    tree, in its own foot tree, databases nested under it, and nothing at all when
 *    the pond has none.
 *  - the breadcrumb pill (ADR 0003): a page under databases starts its trail AT
 *    databases, and the root page itself reads simply "databases" — never inside
 *    life, which would assert the very nesting 3c denies.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import { AreaOverviewPanel } from '@/components/organisms/OverviewSurface'
import type { PageRow } from '@/lib/pages/tree'

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
// Lowercase, as 3c draws it and as `DATABASES_ROOT_TITLE` seeds it.
const databases = node(
  'root-db',
  'databases',
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
    expect(within(life).queryByText('databases')).not.toBeInTheDocument()

    const foot = screen.getByRole('tree', { name: 'Databases' })
    expect(within(foot).getByText('databases')).toBeInTheDocument()
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

// ── The breadcrumb pill on a databases page (ADR 0003) ──────────────────────

describe('breadcrumb — the trail starts at the root the page descends from', () => {
  const at = '2026-01-01T00:00:00Z'
  const ROWS: PageRow[] = [
    { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: at },
    { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: at },
    {
      id: 'db-1',
      parent_id: 'root-db',
      type: 'page',
      title: 'ingredients',
      order: 0,
      updated_at: at,
    },
  ]

  /** Seed ['pages'] so the panel renders from data without a fetch (envless). */
  function renderPanel(areaId: string, title: string) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(['pages', 'main'], ROWS)
    return render(
      <QueryClientProvider client={client}>
        <AreaOverviewPanel areaId={areaId} title={title} />
      </QueryClientProvider>
    )
  }

  it('the databases root page reads simply "databases" — no life, and no duplicate tail', () => {
    const { getByRole } = renderPanel('root-db', 'databases')
    const nav = getByRole('navigation', { name: 'Breadcrumb' })
    // The root crumb IS this page, so it names the surface once and alone.
    expect(within(nav).getAllByText('databases')).toHaveLength(1)
    expect(within(nav).queryByText('life')).toBeNull()
    // No tail at all — and so no rename field on the reserved root, whose title is
    // what `isDatabasesRoot` reads.
    expect(within(nav).queryByRole('textbox')).toBeNull()
  })

  it('a database under the root starts at databases and keeps its own tail', () => {
    const { getByRole } = renderPanel('db-1', 'ingredients')
    const nav = getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('databases')).toBeInTheDocument()
    expect(within(nav).queryByText('life')).toBeNull()
    // The current page is the pill's editable tail, as on any other overview.
    expect(within(nav).getByRole('textbox')).toHaveValue('ingredients')
  })

  it('a page under life still starts at life', () => {
    const { getByRole } = renderPanel('health', 'Health')
    const nav = getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('life')).toBeInTheDocument()
    expect(within(nav).queryByText('databases')).toBeNull()
  })
})
