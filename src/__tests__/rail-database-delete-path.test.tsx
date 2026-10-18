/**
 * Path test for PATH_STEPS B (KAN-300): a staged database-row delete must
 * survive a client-navigation refetch and an in-app remount, while Undo
 * inside the grace window still restores the row and clears its backstop
 * entry — exercised on the real `Rail` inside `DeletionUndoProvider`, not the
 * pure helpers underneath it (those are covered by `rail-staged-ids.test.tsx`
 * and `deletion-undo-wiring.test.tsx`). The reload leftover sweep itself (a
 * genuine prior tab life, as opposed to an in-app remount within this one) is
 * covered separately by `rail-sweep-prior-life.test.tsx`, which seeds
 * `sessionStorage` before `staged-ids` is ever imported.
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { isStaged, unstageId } from '@/lib/deletion/staged-ids'
import { pagesKey } from '@/lib/pages/keys'
import { trashPage } from '@/lib/change-log/trash'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  // The databases root is excluded from the ancestor-reveal effect (KAN-486):
  // opening a database page elsewhere never forces the section open, so the
  // test below opens it itself before reaching "ingredients".
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'db-1' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn().mockResolvedValue(undefined),
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

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
  { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
  { id: 'db-1', parent_id: 'root-db', type: 'page', title: 'ingredients', order: 0, updated_at: AT },
]

const POND: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
}

function newClient(rows: PageRow[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), rows)
  return client
}

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

/** The databases foot tree starts collapsed (KAN-486); click the heading open
 *  to reach "ingredients". */
async function findIngredientsRow() {
  const foot = screen.getByRole('tree', { name: 'Databases' })
  const heading = within(foot).getByRole('treeitem', { name: 'databases' })
  if (heading.getAttribute('aria-expanded') !== 'true') fireEvent.click(heading)
  await waitFor(() =>
    expect(within(foot).getByRole('treeitem', { name: 'ingredients' })).toBeInTheDocument()
  )
  return within(foot).getByRole('treeitem', { name: 'ingredients' })
}

function deleteIngredients(row: HTMLElement) {
  fireEvent.mouseEnter(row)
  fireEvent.click(within(row).getByRole('button', { name: 'Delete ingredients' }))
}

describe('Rail — a database delete persists across navigation and reload (KAN-300 PATH_STEPS B)', () => {
  beforeEach(() => {
    for (const id of ['health', 'root-db', 'db-1']) unstageId(id)
    sessionStorage.clear()
    jest.clearAllMocks()
  })

  it('stays gone through a client-navigation refetch, and an in-app remount (not a reload) does not re-trigger the delete', async () => {
    const client = newClient(ROWS)
    const { unmount } = mount(client)

    const row = await findIngredientsRow()
    deleteIngredients(row)

    const foot = screen.getByRole('tree', { name: 'Databases' })
    await waitFor(() =>
      expect(within(foot).queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()
    )
    expect(isStaged('db-1')).toBe(true)

    // (1) A client navigation's refetch resolving mid-toast must not resurrect
    // the staged row — a fresh array, not the cached reference, so React Query
    // actually notifies subscribers.
    await act(async () => {
      client.setQueryData(pagesKey('pond-1'), [...ROWS])
    })
    expect(within(foot).queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()

    // (2) `pagehide` flushes the deferred commit ahead of the grace window,
    // but the request itself gets cancelled before it reaches the server —
    // mirrored here by a `trashPage` that never settles. The backstop id
    // must stay staged through that (KAN-300 fix).
    ;(trashPage as jest.Mock).mockImplementation(() => new Promise(() => {}))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    await waitFor(() => expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'db-1'))
    expect(isStaged('db-1')).toBe(true)

    // An in-app unmount/remount (no real page reload) is NOT a prior tab
    // life: 'db-1' was staged during this same script execution, so the
    // mount-time sweep must leave it alone rather than hard-deleting it a
    // second time — only `src/__tests__/rail-sweep-prior-life.test.tsx`'s
    // seeded-sessionStorage-before-first-import setup is a genuine prior
    // life, and that is where PATH_STEPS B's actual reload case is covered.
    unmount()
    ;(trashPage as jest.Mock).mockClear()

    mount(newClient(ROWS))
    await waitFor(() =>
      expect(
        within(screen.getByRole('tree', { name: 'Databases' })).queryByRole('treeitem', {
          name: 'ingredients',
        })
      ).not.toBeInTheDocument()
    )
    expect(trashPage).not.toHaveBeenCalled()
    expect(isStaged('db-1')).toBe(true)
  })

  it('Undo inside the window restores the row and clears the backstop entry', async () => {
    const client = newClient(ROWS)
    mount(client)

    const row = await findIngredientsRow()
    deleteIngredients(row)

    const foot = screen.getByRole('tree', { name: 'Databases' })
    await waitFor(() =>
      expect(within(foot).queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()
    )
    expect(isStaged('db-1')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(within(foot).getByRole('treeitem', { name: 'ingredients' })).toBeInTheDocument()
    )
    expect(isStaged('db-1')).toBe(false)
    expect(trashPage).not.toHaveBeenCalled()
  })
})
