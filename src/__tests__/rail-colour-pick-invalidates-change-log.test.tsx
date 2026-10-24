/**
 * KAN-316 — `handlePickColour` (and `handlePickGlyph`, same shape) called
 * `appendOwnEdit` and never invalidated `changeLogKey()`, so an already-open
 * `⌥⌘H` panel (KAN-306) or the change-log page never picked up an own-edit
 * mark pick within the 30s staleTime. Mirrors
 * `page-changes-panel-invalidates-change-log-key.test.tsx`'s root-probe shape.
 */
import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { changeLogKey } from '@/lib/change-log/keys'
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

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({ id: 'record-1' }),
}))

jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: jest.fn() },
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
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
}

/** A probe standing in for an already-open `⌥⌘H` panel hung off the root key. */
function ChangeLogRootProbe() {
  const { data } = useQuery({
    queryKey: changeLogKey(),
    queryFn: () => 'root-data',
  })
  return <div data-testid="root-probe">{data ?? 'none'}</div>
}

function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
  queryClient.setQueryData(pagesKey('pond-1'), ROWS)
  render(
    <QueryClientProvider client={queryClient}>
      <ChangeLogRootProbe />
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return invalidateSpy
}

function colourCell(label: string) {
  return within(document.body)
    .getAllByRole('gridcell')
    .find((cell) => cell.getAttribute('aria-label') === label)!
}

describe('handlePickColour — reaches an already-open change-log view', () => {
  it('invalidates changeLogKey() once the colour pick is logged', async () => {
    const invalidateSpy = mount()
    await screen.findByText('root-data')

    const row = screen.getByRole('treeitem', { name: /Health/ })
    const mark = within(row).getByRole('button', { name: 'change icon for Health' })
    await userEvent.click(mark)
    const sage = colourCell('sage')

    await userEvent.click(sage)

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() }))
  })
})
