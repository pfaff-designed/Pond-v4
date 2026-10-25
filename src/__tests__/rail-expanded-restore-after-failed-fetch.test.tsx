/**
 * KAN-393: a failed `pages` fetch also leaves `isLoading` false with
 * `pages` still `[]` — gating the restore-on-mount effect on `!isLoading`
 * would read that as "loaded, nothing stored" and mark the pond done before
 * a retry ever lands the real rows. The effect must gate on the query
 * actually succeeding.
 */
import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
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
  patchPond: () => {},
}

/** No preset cache data — the query runs the real (mocked) `fetchPages`. */
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

describe('the rail restores a stored expansion after a failed fetch retries (KAN-393)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => jest.clearAllMocks())

  it('restores stored rows once the retry succeeds, without overwriting the store meanwhile', async () => {
    writeExpandedIds('pond-1', ['kitchen'])

    let rejectFirstFetch: (err: Error) => void = () => {}
    ;(fetchPages as jest.Mock).mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectFirstFetch = reject))
    )

    const client = mountRailCold()
    await waitFor(() => expect(fetchPages).toHaveBeenCalledTimes(1))

    await act(async () => {
      rejectFirstFetch(new Error('network error'))
      // Let the rejection settle into the query's `error` status before asserting.
      await Promise.resolve().then(() => Promise.resolve())
    })
    await waitFor(() =>
      expect(client.getQueryState(pagesKey('pond-1'))?.status).toBe('error')
    )
    expect(screen.queryByRole('treeitem', { name: 'Kitchen renovation' })).not.toBeInTheDocument()
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])

    ;(fetchPages as jest.Mock).mockResolvedValueOnce([KITCHEN, CABINETS])
    await act(async () => {
      await client.refetchQueries({ queryKey: pagesKey('pond-1') })
    })

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Cabinets' })).toBeInTheDocument()
    )
    expect(readExpandedIds('pond-1')).toEqual(['kitchen'])
  })
})
