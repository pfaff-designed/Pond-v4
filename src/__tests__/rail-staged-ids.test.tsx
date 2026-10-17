/**
 * Rail's own staged-ids wiring (KAN-300 item 2c): the backstop id threaded
 * into `stageDeletion` keeps a staged row out of the rendered tree even if a
 * refetch mid-toast brings the undeleted row back. A genuine leftover id from
 * a reload that never finished its own `pagehide` flush is covered by
 * `rail-sweep-prior-life.test.tsx` (it must be in `sessionStorage` BEFORE
 * `staged-ids`'s first hydrate to count as a prior tab life — calling
 * `stageId` directly, as this file's tests do, happens after that hydrate and
 * is deliberately NOT swept; see the second test below).
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { isStaged, stageId, unstageId } from '@/lib/deletion/staged-ids'
import { pagesKey } from '@/lib/pages/keys'
import { deletePage } from '@/lib/pages/client'
import { unlinkTrashedSubtree } from '@/lib/pages/child-links'
import { trashPage } from '@/lib/change-log/trash'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
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

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
  unlinkTrashedSubtree: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn().mockResolvedValue(undefined),
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
  { id: 'sleep', parent_id: null, type: 'page', title: 'Sleep', order: 1, updated_at: AT },
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

describe('Rail — staged-ids wiring (KAN-300)', () => {
  beforeEach(() => {
    for (const id of ['health', 'sleep', 'leftover']) unstageId(id)
    sessionStorage.clear()
    jest.clearAllMocks()
  })

  it('a staged id stays out of the rendered tree even after the query cache refetches during the window', async () => {
    const client = newClient(ROWS)
    mount(client)

    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    )
    expect(isStaged('sleep')).toBe(true)

    // A refetch mid-toast resolving with the still-undeleted row (the server
    // hasn't committed the delete yet) must not resurrect it in the rail. A
    // fresh array (not the same `ROWS` reference already in the cache) so
    // React Query actually treats this as new data and notifies subscribers.
    await act(async () => {
      client.setQueryData(pagesKey('pond-1'), [...ROWS])
    })

    expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
  })

  it('an id staged in this same script (not a reload leftover) is not swept on mount', async () => {
    stageId('leftover')
    const client = newClient(ROWS)
    mount(client)

    await screen.findByRole('tree', { name: 'Workspace' })
    expect(deletePage).not.toHaveBeenCalled()
    expect(isStaged('leftover')).toBe(true)
  })

  // KAN-448: the staged delete's own commit (not the optimistic stage) is
  // the only moment `unlinkTrashedSubtree` may run — undoing from the toast
  // must leave a trashed page's links untouched.
  it('a committed delete unlinks the subtree before trashPage runs', async () => {
    const order: string[] = []
    ;(unlinkTrashedSubtree as jest.Mock).mockImplementation(async () => {
      order.push('unlink')
    })
    ;(trashPage as jest.Mock).mockImplementation(async () => {
      order.push('trash')
    })

    const client = newClient(ROWS)
    mount(client)
    const user = userEvent.setup()

    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    // Dismiss flushes the deferred commit ahead of the grace window.
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(trashPage).toHaveBeenCalled())
    expect(unlinkTrashedSubtree).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      pondId: 'pond-1',
      rootPageId: 'sleep',
      subtreeIds: new Set(['sleep']),
    })
    expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'sleep')
    expect(order).toEqual(['unlink', 'trash'])
  })

  it('clicking undo on the toast never unlinks — the commit never ran', async () => {
    const client = newClient(ROWS)
    mount(client)
    const user = userEvent.setup()

    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    await user.click(await screen.findByRole('button', { name: 'Undo' }))

    await screen.findByRole('treeitem', { name: /Sleep/ })
    expect(unlinkTrashedSubtree).not.toHaveBeenCalled()
    expect(trashPage).not.toHaveBeenCalled()
  })
})
