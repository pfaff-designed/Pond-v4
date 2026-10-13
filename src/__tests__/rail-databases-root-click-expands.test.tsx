/**
 * Live-verified (KAN-300): the databases root draws no caret (PondRail.dc.html),
 * so a mouse user's only way to open it is the row itself — but the row's click
 * only navigated to the databases page, never expanded it in the rail, so a
 * database's rows (and their hover ×) were reachable by mouse only after the
 * ancestor-reveal effect expanded the root some other way (opening a database
 * from elsewhere). Exercised on the full `Rail`, not `RailView` alone, since
 * the navigate-vs-expand split lives in `Rail`'s own `handleSelect`.
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  // No open page — the databases root starts collapsed, as it does on a
  // fresh load with nothing selected under it.
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

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), ROWS)
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

describe('Rail — clicking the databases root expands it for a mouse user (KAN-300)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('clicking the root row reveals its database rows, whose hover delete is then reachable', async () => {
    mount()
    const foot = screen.getByRole('tree', { name: 'Databases' })
    expect(within(foot).queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()

    fireEvent.click(within(foot).getByRole('treeitem', { name: 'databases' }))

    // Still opens the databases page — the fix adds expansion, it doesn't drop it.
    expect(push).toHaveBeenCalledTimes(1)

    const row = await waitFor(() => within(foot).getByRole('treeitem', { name: 'ingredients' }))
    fireEvent.mouseEnter(row)
    expect(within(row).getByRole('button', { name: 'Delete ingredients' })).toBeInTheDocument()
  })
})
