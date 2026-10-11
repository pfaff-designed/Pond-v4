/**
 * The databases root in the CHROME (#101 AC3, `Pond 03 Concepts` 3c: "two roots:
 * life for reading, databases for data" — peers, one beside the other).
 *
 *  - the rail (PondRail draws it at the foot, after the Life tree): out of the Life
 *    tree, in its own foot tree, databases nested under it, and nothing at all when
 *    the pond has none.
 *  - the path `PondCommand` shows at rest (ADR 0003): a page under databases starts
 *    its trail AT databases, and the root page itself reads simply "databases" —
 *    never inside life, which would assert the very nesting 3c denies.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RailView, type RailNode } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { PageRow } from '@/lib/pages/tree'
import { withPathProbe } from './helpers/command-path-probe'

// Which page the URL names, for the DocumentPanel-based path tests below.
let currentNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

// The page surface's reads, stubbed: the open page by id, and the root page's
// home row (whose title is the path's root).
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

function renderRail(
  tree: RailNode[],
  expanded = new Set<string>(),
  onOpenDatabases: () => void = jest.fn()
) {
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
      onOpenDatabases={onOpenDatabases}
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

  it('draws the databases row before the pond has a root, and opening it asks for one', () => {
    const onOpenDatabases = jest.fn()
    renderRail([health], new Set<string>(), onOpenDatabases)
    const foot = screen.getByRole('tree', { name: 'Databases' })
    fireEvent.click(within(foot).getByRole('treeitem', { name: /databases/ }))
    expect(onOpenDatabases).toHaveBeenCalledTimes(1)
  })
})

// ── The path on a databases page (ADR 0003) ──────────────────────────────────

describe('the path — it starts at the root the page descends from', () => {
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
    client.setQueryData(['pages'], ROWS)
    return render(
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>{withPathProbe(<DocumentPanel />)}</DeletionUndoProvider>
      </QueryClientProvider>
    )
  }

  it('the databases root page reads simply "databases" — no life, and no duplicate tail', async () => {
    const { findByTestId } = renderPanel('root-db')
    // The root IS this page, so it names the surface once and alone.
    await waitFor(async () => expect(await findByTestId('command-path')).toHaveTextContent(/^databases$/))
    expect(screen.getByLabelText('Page title')).toHaveValue('databases')
  })

  it('a database under the root starts at databases and keeps its own tail', async () => {
    const { findByTestId } = renderPanel('db-1')
    await waitFor(async () =>
      expect(await findByTestId('command-path')).toHaveTextContent(/^databases › ingredients$/)
    )
    expect(screen.getByLabelText('Page title')).toHaveValue('ingredients')
  })

  it('a page under life still starts at life', async () => {
    const { findByTestId } = renderPanel('health')
    await waitFor(async () =>
      expect(await findByTestId('command-path')).toHaveTextContent(/^life › Health$/)
    )
  })
})
