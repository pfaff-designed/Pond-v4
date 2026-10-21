/**
 * KAN-486: the databases heading is a disclosure, not a page link — clicking
 * it toggles expansion both ways and never navigates (superseding KAN-300's
 * expand-and-navigate contract). Exercised on the full `Rail`, not `RailView`
 * alone, since the toggle-instead-of-navigate split lives in `Rail`'s own
 * `handleSelect`.
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

describe('Rail — clicking the databases heading toggles it, never navigates (KAN-486)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens on click, closes on a second click, reopens on a third — and never navigates', async () => {
    mount()
    const foot = screen.getByRole('tree', { name: 'Databases' })
    const heading = within(foot).getByRole('treeitem', { name: 'databases' })
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(within(foot).queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()

    fireEvent.click(heading)
    await waitFor(() => expect(heading).toHaveAttribute('aria-expanded', 'true'))
    const row = within(foot).getByRole('treeitem', { name: 'ingredients' })
    expect(row).toBeInTheDocument()

    fireEvent.click(heading)
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(within(foot).queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()

    fireEvent.click(heading)
    await waitFor(() => expect(heading).toHaveAttribute('aria-expanded', 'true'))
    expect(within(foot).getByRole('treeitem', { name: 'ingredients' })).toBeInTheDocument()

    // The heading never has a destination of its own — ⌘K / the breadcrumb reach it instead.
    expect(push).not.toHaveBeenCalled()
  })
})
