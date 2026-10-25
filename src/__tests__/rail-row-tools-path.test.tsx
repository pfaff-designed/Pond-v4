/**
 * KAN-314 item 4 (PATH_STEPS): the person's actual path through the real
 * `Rail` host (not the isolated row) — hover then one click on × deletes the
 * open row and a non-open row alike, with no prior row click, and the undo
 * toast shows; ＋ still opens the new-page menu. Mirrors the mocking shape
 * of rail-delete-then-create.test.tsx (KAN-273), trimmed to this ticket's
 * concern.
 */
import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

const selectedNodeId: { current: string | null } = { current: 'sleep' }

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? selectedNodeId.current : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-1', title: 'Untitled' }),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => ROWS.map((r) => ({ ...r }))),
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

describe('Rail — the real host, the person\'s path (KAN-314 item 4)', () => {
  beforeEach(() => {
    selectedNodeId.current = 'sleep'
  })

  it('open row: hover then one click on × deletes it, no row click first, undo toast shown', async () => {
    const user = userEvent.setup()
    mount()

    const sleepRow = screen.getByRole('treeitem', { name: 'Sleep' })
    await user.hover(sleepRow)
    await user.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Sleep' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Sleep"')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('non-open row: hover then one click on × deletes it, no row click first', async () => {
    const user = userEvent.setup()
    mount()

    const healthRow = screen.getByRole('treeitem', { name: 'Health' })
    await user.hover(healthRow)
    await user.click(within(healthRow).getByRole('button', { name: 'Delete Health' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Health' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Health"')
  })

  it('＋ still opens the new-page menu on a row', async () => {
    const user = userEvent.setup()
    mount()

    const healthRow = screen.getByRole('treeitem', { name: 'Health' })
    await user.hover(healthRow)
    await user.click(within(healthRow).getByRole('button', { name: 'Add sub-page to Health' }))

    expect(await screen.findByRole('menu', { name: 'new page menu' })).toBeInTheDocument()
  })
})
