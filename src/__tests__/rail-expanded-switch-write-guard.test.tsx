/**
 * KAN-393: switching pond A → B while B's `pages` have not been cached yet
 * must not overwrite B's already-stored expansion with `[]`. The reset
 * effect clears `expanded` to `new Set()` on the switch, and that clear is
 * itself a render of `expanded` — a write effect gated only on "did pondId
 * just change" (not on whether B's store has been read yet) fires on that
 * render and persists the empty set before the restore-on-mount effect gets
 * to merge B's real stored ids in. The same race reproduces in
 * `React.StrictMode`, where effects run twice on mount.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
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
const GARAGE: PageRow = {
  id: 'garage',
  parent_id: null,
  type: 'page',
  title: 'Garage',
  order: 0,
  updated_at: AT,
}
const SHELF: PageRow = {
  id: 'shelf',
  parent_id: 'garage',
  type: 'page',
  title: 'Shelf',
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

const withPond = (client: QueryClient, pond: Pond, strict = false) => {
  const tree = (
    <QueryClientProvider client={client}>
      <PondContext.Provider value={providerValue(pond)}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return strict ? <React.StrictMode>{tree}</React.StrictMode> : tree
}

describe("a pond switch does not clobber the new pond's stored expansion before it loads (KAN-393)", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => jest.clearAllMocks())

  it("keeps pond B's seeded store intact across the switch and the fetch resolving", async () => {
    writeExpandedIds('pond-2', ['garage'])

    let resolveFetch: (rows: PageRow[]) => void = () => {}
    ;(fetchPages as jest.Mock).mockImplementation((pondId: string) => {
      if (pondId === 'pond-1') return Promise.resolve([KITCHEN])
      return new Promise((resolve) => (resolveFetch = resolve))
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })

    const { rerender } = render(withPond(client, POND_A))
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Kitchen renovation' })).toBeInTheDocument()
    )

    rerender(withPond(client, POND_B))
    await waitFor(() => expect(fetchPages).toHaveBeenCalledWith('pond-2'))

    // Before the fetch resolves, B's seeded store must still read back intact —
    // not wiped by the switch's own clear-to-[] render.
    expect(readExpandedIds('pond-2')).toEqual(['garage'])

    resolveFetch([GARAGE, SHELF])
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Shelf' })).toBeInTheDocument()
    )

    expect(readExpandedIds('pond-2')).toEqual(['garage'])
  })

  it('survives React.StrictMode double-invoked effects on a cold mount', async () => {
    writeExpandedIds('pond-2', ['garage'])

    let resolveFetch: (rows: PageRow[]) => void = () => {}
    ;(fetchPages as jest.Mock).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve))
    )

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })

    render(withPond(client, POND_B, true))
    await waitFor(() => expect(fetchPages).toHaveBeenCalled())

    expect(readExpandedIds('pond-2')).toEqual(['garage'])

    resolveFetch([GARAGE, SHELF])
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Shelf' })).toBeInTheDocument()
    )

    expect(readExpandedIds('pond-2')).toEqual(['garage'])
  })
})
