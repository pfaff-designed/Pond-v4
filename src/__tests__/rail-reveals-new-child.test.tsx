/**
 * KAN-122: the `/ nested page` swap stays on the parent, so the ancestor
 * reveal effect never fires (selection doesn't change). The selected node's
 * own row must expand itself the moment its child set gains an id it didn't
 * have, so a child inserted by `insertPageOptimistic` is visible right away.
 */
import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { fetchPages } from '@/lib/pages/tree'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'kitchen' : null) }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(),
}))

const AT = '2026-01-01T00:00:00Z'
const KITCHEN: PageRow = {
  id: 'kitchen',
  parent_id: null,
  type: 'page',
  title: 'Kitchen renovation',
  order: 0,
  updated_at: AT,
}
const CABINETS: PageRow = {
  id: 'cabinets',
  parent_id: 'kitchen',
  type: 'page',
  title: 'Cabinets',
  order: 0,
  updated_at: AT,
}

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

function mountRail(rows: PageRow[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), rows)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return client
}

/** No preset cache data — the query starts `isLoading`, exactly a cold page load. */
function mountRailCold() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return client
}

describe('Rail reveals a new child without leaving the parent (KAN-122)', () => {
  // KAN-393's persisted-expansion store now reads/writes real `localStorage`
  // under the pond's own key, so a prior test's expansion must not leak in.
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('expands the selected node once its child set gains an id', async () => {
    const client = mountRail([KITCHEN])

    expect(screen.queryByRole('treeitem', { name: 'Cabinets' })).not.toBeInTheDocument()

    act(() => {
      client.setQueryData(pagesKey('pond-1'), [KITCHEN, CABINETS])
    })

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
    )
  })

  it('does not auto-expand the selected node on a cold load with an existing child', async () => {
    ;(fetchPages as jest.Mock).mockResolvedValue([KITCHEN, CABINETS])

    mountRailCold()

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Kitchen renovation' })).toBeInTheDocument()
    )

    expect(screen.queryByRole('treeitem', { name: 'Cabinets' })).not.toBeInTheDocument()
  })
})
