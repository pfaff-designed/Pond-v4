/**
 * KAN-388 (PATH_STEPS step 2): hovering an unopened rail row for ≥60ms warms
 * its page's `['page', id]` cache, so the click that follows never blanks
 * the canvas. Mirrors the mocking shape of rail-row-tools-path.test.tsx,
 * trimmed to this ticket's concern.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

const selectedNodeId: { current: string | null } = { current: null }

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? selectedNodeId.current : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => ROWS.map((r) => ({ ...r }))),
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'sleep', parent_id: null, type: 'page', title: 'Sleep', order: 0, updated_at: AT },
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 1, updated_at: AT },
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
  patchPond: () => {},
  removePond: () => {},
}

function mount(queryClient: QueryClient) {
  queryClient.setQueryData(pagesKey('pond-1'), ROWS)
  return render(
    <QueryClientProvider client={queryClient}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe('Rail row hover prefetch (KAN-388)', () => {
  let queryClient: QueryClient
  let prefetchSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('fires once after a row holds the pointer for 60ms', () => {
    mount(queryClient)
    const sleepRow = screen.getByRole('treeitem', { name: 'Sleep' })

    fireEvent.pointerEnter(sleepRow)
    jest.advanceTimersByTime(60)

    expect(prefetchSpy).toHaveBeenCalledTimes(1)
    expect(prefetchSpy.mock.calls[0][0].queryKey).toEqual(['page', 'sleep'])
  })

  it('a fast sweep down the rail (each row held under 60ms) fires nothing', () => {
    mount(queryClient)
    const sleepRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const healthRow = screen.getByRole('treeitem', { name: 'Health' })

    for (const row of [sleepRow, healthRow, sleepRow, healthRow]) {
      fireEvent.pointerEnter(row)
      jest.advanceTimersByTime(20)
      fireEvent.pointerLeave(row)
    }
    jest.advanceTimersByTime(1000)

    expect(prefetchSpy).not.toHaveBeenCalled()
  })
})
