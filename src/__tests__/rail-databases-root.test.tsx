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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { PageRow } from '@/lib/pages/tree'

// Which page the URL names, for the DocumentPanel-based breadcrumb tests below.
let currentNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// The page surface's reads, stubbed: the open page by id, and the root page's
// home row (whose title is the breadcrumb's root crumb).
const PAGES: Record<string, Record<string, unknown>> = {}
jest.mock('@/lib/pages/client', () => ({
  getPage: (_sb: unknown, id: string) => Promise.resolve(PAGES[id] ?? null),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: () => Promise.resolve({ id: 'home-1', title: 'life', blocks: [] }),
}))

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

// `PondRail.dc.html`'s foot (line 29) is exactly `dbRow` (cylinder + "databases")
// above `newRow` ("＋ new page") — ONE flat row: no chevron, no children, no nested
// tree. #229 moved the root there and dropped the second `role="tree"`: the rail
// is the Life tree plus a foot link, and a database is reached by opening the
// databases page, which lists its children.
describe('rail — the databases root is one flat foot row (#229)', () => {
  it('renders the root in the foot as a control, not among the Life areas and in no second tree', () => {
    renderRail([health, databases])
    const life = screen.getByRole('tree', { name: 'Workspace' })
    expect(within(life).getByText('Health')).toBeInTheDocument()
    expect(within(life).queryByText('databases')).not.toBeInTheDocument()
    expect(screen.getAllByRole('tree')).toHaveLength(1)

    const row = screen.getByRole('button', { name: 'databases' })
    expect(row.closest('[data-part="rail-foot"]')).not.toBeNull()
    expect(row.querySelector('ellipse')).not.toBeNull() // the cylinder mark
    // dbRow: 13.5 / 500, gap 9, padding 6px 8px, radius 10
    expect(row.className).toMatch(/\btext-\[13\.5px\](?:\s|$)/)
    expect(row.className).toMatch(/\bfont-medium\b/)
    expect(row.className).toMatch(/\bgap-\[9px\](?:\s|$)/)
    expect(row.className).toMatch(/\bpx-2\b/)
    expect(row.className).toMatch(/\bpy-1\.5\b/)
    expect(row.className).toMatch(/\brounded-mn-row\b/)
  })

  it('never lists the databases themselves in the rail, expanded or not', () => {
    renderRail([health, databases], new Set(['root-db']))
    expect(screen.queryByText('ingredients')).not.toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /databases/ })).not.toBeInTheDocument()
  })

  it('opens the databases page through the same onSelect as any row, and reads selected on it', () => {
    const onSelect = jest.fn()
    render(
      <RailView
        tree={[health, databases]}
        pondName="life"
        selectedId={null}
        expanded={new Set()}
        lifeExpanded
        busyId={null}
        isLoading={false}
        isEmpty={false}
        onSelect={onSelect}
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
    const row = screen.getByRole('button', { name: 'databases' })
    expect(row).not.toHaveAttribute('aria-current')
    expect(row.className).not.toMatch(/\bbg-mn-hover-fill\b/)
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith('root-db')
  })

  it('marks the foot row selected (ink .07) when the databases root is the open page', () => {
    render(
      <RailView
        tree={[health, databases]}
        pondName="life"
        selectedId="root-db"
        expanded={new Set()}
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
    const row = screen.getByRole('button', { name: 'databases' })
    expect(row).toHaveAttribute('aria-current', 'page')
    expect(row.className).toMatch(/\bbg-mn-hover-fill\b/)
  })

  it('draws no databases row until the pond has one', () => {
    renderRail([health])
    expect(screen.queryByRole('button', { name: 'databases' })).not.toBeInTheDocument()
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
  for (const r of ROWS) {
    PAGES[r.id] = {
      id: r.id,
      parentId: r.parent_id,
      type: r.type,
      title: r.title,
      blocks: [],
      props: {},
    }
  }

  /** Seed ['pages'] so the panel renders from data without a fetch (envless). */
  function renderPanel(nodeId: string) {
    currentNodeId = nodeId
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(['pages', 'main'], ROWS)
    return render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
  }

  it('the databases root page reads simply "databases" — no life, and no duplicate tail', async () => {
    const { findByRole } = renderPanel('root-db')
    const nav = await findByRole('navigation', { name: 'Breadcrumb' })
    // The root crumb IS this page, so it names the surface once and alone; the
    // title input below the pill is the page's tail, as on every page (#234).
    expect(within(nav).getAllByText('databases')).toHaveLength(1)
    expect(within(nav).queryByText('life')).toBeNull()
    expect(screen.getByLabelText('Page title')).toHaveValue('databases')
  })

  it('a database under the root starts at databases and keeps its own tail', async () => {
    const { findByRole } = renderPanel('db-1')
    const nav = await findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('databases')).toBeInTheDocument()
    expect(within(nav).queryByText('life')).toBeNull()
    expect(screen.getByLabelText('Page title')).toHaveValue('ingredients')
  })

  it('a page under life still starts at life', async () => {
    const { findByRole } = renderPanel('health')
    const nav = await findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('life')).toBeInTheDocument()
    expect(within(nav).queryByText('databases')).toBeNull()
  })
})
