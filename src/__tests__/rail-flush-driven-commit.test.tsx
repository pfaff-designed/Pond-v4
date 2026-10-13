/**
 * KAN-273: a commit-first flush (updateTitle/createPage/movePage awaiting
 * `flushStagedDeletes()` ahead of their own write) runs INSIDE the outer
 * write's `withUser` call. If the nested, flush-driven commit of the staged
 * delete also invalidates `['pages']`, that refetch lands before the outer
 * write's own insert/update, reverting the outer write's optimistic cache
 * change — a flicker of the same kind this ticket fixes. Only the
 * timer/toast-driven commit (grace window elapsing, × dismiss) should
 * invalidate; a flush-driven one must leave it to the outer write.
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { unstageId } from '@/lib/deletion/staged-ids'
import { pagesKey } from '@/lib/pages/keys'
import { deletePage } from '@/lib/pages/client'
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

// `updateTitle`'s real implementation calls `await flushStagedDeletes()` as
// its first line (src/lib/pages/client.ts) before doing its own write. The
// mock reproduces exactly that ordering against the REAL registry/provider,
// without needing to mock the supabase update/sibling-lookup chain too.
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-1', title: 'Untitled' }),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn(async () => {
    const { flushStagedDeletes } = jest.requireActual('@/lib/deletion/staged-ids')
    await flushStagedDeletes()
  }),
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

describe('Rail — a flush-driven delete commit does not invalidate (KAN-273)', () => {
  beforeEach(() => {
    for (const id of ['health', 'sleep']) unstageId(id)
    sessionStorage.clear()
    jest.clearAllMocks()
  })

  it('optimistic rename with a staged delete: the pages query is invalidated once (the rename), not twice (rename + the flush-driven delete commit)', async () => {
    const client = newClient(ROWS)
    mount(client)
    const invalidateSpy = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)

    // Stage a delete of Sleep — its commit is deferred behind the grace window.
    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    )

    invalidateSpy.mockClear()

    // Within the grace window, rename Health. `updateTitle`'s own commit-first
    // flush commits the staged Sleep delete INSIDE this write, before Health's
    // rename lands.
    const healthRow = screen.getByRole('treeitem', { name: /Health/ })
    fireEvent.doubleClick(healthRow)
    const field = screen.getByRole('textbox', { name: /rename Health/ })
    fireEvent.change(field, { target: { value: 'Health Renamed' } })
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' })
    })

    // The staged delete committed as part of the rename's flush.
    expect(deletePage).toHaveBeenCalledWith(expect.anything(), 'sleep')

    // Exactly one invalidate of the pages list — the rename's own (outer
    // write). The flush-driven delete commit, nested inside it, must not add
    // a second one that would refetch before the rename's write has landed.
    const pagesInvalidations = invalidateSpy.mock.calls.filter(
      ([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey) === JSON.stringify(['pages'])
    )
    expect(pagesInvalidations).toHaveLength(1)

    // The renamed title is still what the person typed — never reverted by a
    // premature refetch in between.
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /Health Renamed/ })).toBeInTheDocument()
    )
  })
})
