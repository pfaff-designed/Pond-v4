/**
 * The change log's rail row (KAN-94): a reserved virtual page, the databases
 * root's first child — no `pages` row, no migration, same shape as
 * `DATABASES_PLACEHOLDER_ROW`. Shown only once the root itself is expanded,
 * exactly like any other child.
 */
import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RailView, Rail, type RailNode } from '@/components/organisms/Rail'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import { workspaceUrl } from '@/lib/pages/nav'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))
const mockGetOrCreateDatabasesRoot = jest.fn()
jest.mock('@/lib/pages/databases-root', () => ({
  ...jest.requireActual('@/lib/pages/databases-root'),
  getOrCreateDatabasesRoot: (...args: unknown[]) => mockGetOrCreateDatabasesRoot(...args),
}))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
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

describe('rail — the change log row (KAN-94)', () => {
  it('expanding an existing databases root shows the row, as the root’s first child', () => {
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
    // KAN-486: the heading is the LAST row now (its own rows sit above it,
    // never below), so `change log` leads the list rather than following the
    // heading at index 0.
    const rows = within(foot).getAllByRole('treeitem')
    expect(rows[0]).toHaveAccessibleName('change log')
  })

  it('offers no mark/icon picker — there is no page behind it to write a mark to', () => {
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
    const row = within(foot).getByRole('treeitem', { name: 'change log' })
    expect(within(row).queryByRole('button', { name: 'change icon for change log' })).not.toBeInTheDocument()
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
    expect(within(foot).queryByText('change log')).not.toBeInTheDocument()
    expect(within(foot).queryByRole('treeitem', { name: 'change log' })).not.toBeInTheDocument()
  })

  it('clicking the row opens the change log’s own workspace URL, not a page navigate', async () => {
    const AT = '2026-01-01T00:00:00Z'
    const ROWS: PageRow[] = [
      { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
      { id: 'db-1', parent_id: 'root-db', type: 'page', title: 'ingredients', order: 0, updated_at: AT },
    ]
    const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
    const PROVIDER_VALUE: PondContextValue = {
      pond: POND,
      ponds: [POND],
      loading: false,
      reload: () => {},
      addPond: () => {},
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(pagesKey('pond-1'), ROWS)
    render(
      <QueryClientProvider client={client}>
        <PondContext.Provider value={PROVIDER_VALUE}>
          <DeletionUndoProvider>
            <Rail />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )
    const foot = screen.getByRole('tree', { name: 'Databases' })
    fireEvent.click(within(foot).getByRole('treeitem', { name: 'databases' }))
    const row = await within(foot).findByRole('treeitem', { name: 'change log' })
    fireEvent.click(row)
    expect(push).toHaveBeenCalledWith(
      workspaceUrl({ id: CHANGE_LOG_NODE_ID, type: 'page', title: 'change log' })
    )
  })

  it('clicking the placeholder in a pond with no root shows the change log row without a second click', async () => {
    const AT = '2026-01-01T00:00:00Z'
    const NO_ROOT: PageRow[] = [
      { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
    ]
    const WITH_ROOT: PageRow[] = [
      ...NO_ROOT,
      { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
    ]
    mockFetchPages.mockResolvedValue(NO_ROOT)
    mockGetOrCreateDatabasesRoot.mockImplementation(() => {
      mockFetchPages.mockResolvedValue(WITH_ROOT)
      return Promise.resolve({ id: 'root-db', created: true })
    })
    const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
    const PROVIDER_VALUE: PondContextValue = {
      pond: POND,
      ponds: [POND],
      loading: false,
      reload: () => {},
      addPond: () => {},
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(pagesKey('pond-1'), NO_ROOT)
    render(
      <QueryClientProvider client={client}>
        <PondContext.Provider value={PROVIDER_VALUE}>
          <DeletionUndoProvider>
            <Rail />
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )
    const foot = screen.getByRole('tree', { name: 'Databases' })
    fireEvent.click(within(foot).getByRole('treeitem', { name: 'databases' }))
    expect(await within(foot).findByRole('treeitem', { name: 'change log' })).toBeInTheDocument()
  })
})
