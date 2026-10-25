/**
 * KAN-388 path test: the real `Rail` host and `DocumentPanel` mounted
 * together, following `kan-302-path.test.tsx`'s shape — mocking only the
 * network boundary, letting the real navigation wiring (`Rail`'s
 * `handleSelect` → `router.push` → `useSearchParams`) drive the shared page.
 *
 * `next/navigation` is mocked with a mutable `selectedNodeId` ref (the
 * `rail-hover-prefetch.test.tsx` pattern) plus a tiny listener set so a
 * `push()` call — synchronous inside `Rail`'s click handler — forces this
 * harness to re-render in the SAME `act`, the way Next's router would.
 */

import React, { useEffect, useReducer } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import { findTextBlock } from './helpers/text-block'

const selectedNodeId: { current: string | null } = { current: 'sleep' }
const navigationListeners = new Set<() => void>()
function notifyNavigation() {
  navigationListeners.forEach((listener) => listener())
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (url: string) => {
      const [, query] = url.split('?')
      selectedNodeId.current = new URLSearchParams(query).get('nodeId')
      notifyNavigation()
    },
  }),
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

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/home', () => ({
  ...jest.requireActual('@/lib/pages/home'),
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
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

/** Re-renders on `push()`, the one thing Next's real router does that the mock above cannot. */
function Harness() {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    navigationListeners.add(bump)
    return () => {
      navigationListeners.delete(bump)
    }
  }, [bump])
  return (
    <>
      <Rail />
      <DocumentPanel />
    </>
  )
}

function mount(queryClient: QueryClient) {
  queryClient.setQueryData(pagesKey('pond-1'), ROWS)
  return render(
    <QueryClientProvider client={queryClient}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Harness />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  selectedNodeId.current = 'sleep'
  navigationListeners.clear()
  jest.useFakeTimers()
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) =>
    id === 'sleep' ? { id: 'sleep', title: 'Sleep', blocks: [{ id: 'b1', type: 'text', content: 'sleep notes' }] } : null
  )
})

afterEach(() => {
  jest.useRealTimers()
})

describe('KAN-388 path test — hover warms the cache, click never blanks the canvas', () => {
  it('a fast sweep fires nothing; hovering the target ≥60ms then clicking it paints the title at once, blocks fill in after', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery')
    mount(queryClient)

    // The already-open page lands first, so the health row below is genuinely
    // "not yet opened this session".
    expect(await screen.findByLabelText('Page title')).toHaveValue('Sleep')

    const sleepRow = screen.getByRole('treeitem', { name: 'Sleep' })
    const healthRow = screen.getByRole('treeitem', { name: 'Health' })

    // Sweep: each row held well under the 60ms hold, cleared before it fires.
    for (const row of [healthRow, sleepRow, healthRow]) {
      await user.hover(row)
      act(() => jest.advanceTimersByTime(20))
      await user.unhover(row)
    }
    act(() => jest.advanceTimersByTime(1000))
    expect(prefetchSpy).not.toHaveBeenCalled()

    // One held hover on Health only, held at the real journal.
    let resolveHealth!: (value: unknown) => void
    mockGetPage.mockImplementation(
      (_supabase: unknown, id: string) =>
        id === 'health'
          ? new Promise((resolve) => {
              resolveHealth = resolve
            })
          : Promise.resolve(null)
    )

    await user.hover(healthRow)
    act(() => jest.advanceTimersByTime(60))

    expect(prefetchSpy).toHaveBeenCalled()
    for (const call of prefetchSpy.mock.calls) {
      expect((call[0] as { queryKey: unknown[] }).queryKey).toEqual(['page', 'health'])
    }

    await user.click(healthRow)

    // Same act: the row's own title paints from the `['pages']` cache, never "Loading…".
    expect(screen.getByLabelText('Page title')).toHaveValue('Health')
    expect(screen.queryByText('Loading…')).toBeNull()

    await act(async () => {
      resolveHealth({ id: 'health', title: 'Health', blocks: [{ id: 'b2', type: 'text', content: 'health notes' }] })
    })

    expect(await findTextBlock()).toBeInTheDocument()
  })
})
