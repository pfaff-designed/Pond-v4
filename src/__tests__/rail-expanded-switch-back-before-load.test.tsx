/**
 * KAN-393: pond A (loaded) → pond B (pages never resolve) → back to A before
 * B loads must leave pond A's store untouched. `loadedForRef` is only ever
 * set by the restore effect once a pond's store has been read, and the
 * pond-switch reset effect must clear it on every real switch (not just
 * `revealedForRef`) — otherwise it's still pinned to A from A's original
 * load, so switching back to A reads as "already loaded" and the write
 * effect persists the switch's own cleared `new Set()` over A's real store
 * before the restore effect ever gets a chance to re-read it.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { fetchPages } from '@/lib/pages/tree'
import { readExpandedIds, writeExpandedIds } from '@/lib/rail/expanded-store'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
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

const POND_A: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const POND_B: Pond = { ...POND_A, id: 'pond-2' }

const providerValue = (pond: Pond): PondContextValue => ({
  pond,
  ponds: [pond],
  loading: false,
  reload: () => {},
  addPond: () => {},
})

const withPond = (client: QueryClient, pond: Pond) => (
  <QueryClientProvider client={client}>
    <PondContext.Provider value={providerValue(pond)}>
      <DeletionUndoProvider>
        <Rail />
      </DeletionUndoProvider>
    </PondContext.Provider>
  </QueryClientProvider>
)

describe("switching back to pond A before pond B loads keeps A's store (KAN-393)", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => jest.clearAllMocks())

  it("leaves pond A's stored ids unchanged and its row expanded", async () => {
    writeExpandedIds('pond-1', ['kitchen'])

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(pagesKey('pond-1'), [KITCHEN, CABINETS])
    // pond-2's fetch never resolves, simulating "slow or failing".
    ;(fetchPages as jest.Mock).mockImplementation(() => new Promise(() => {}))

    const { rerender } = render(withPond(client, POND_A))
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
    )

    rerender(withPond(client, POND_B))
    await waitFor(() => expect(fetchPages).toHaveBeenCalledWith('pond-2'))

    rerender(withPond(client, POND_A))

    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])
    expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
  })
})
