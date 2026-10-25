/**
 * KAN-468 — Path test A: PATH_STEPS' ⌘K door. ⌘K → "duplicate page" → "Recipes 2"
 * appears directly below "Recipes" in the rail and opens → ⌘Z → gone.
 *
 * Mounts the real `Rail` and `ShellCommands` in one `QueryClientProvider` (no
 * `DocumentPanel`, no move harness) — only the RPC boundary is faked: `duplicatePage`
 * and `fetchPages` share one mutable `table` standing in for Postgres (the same
 * "fake the table, not the cache" shape `rail-move-undo-path.test.tsx` uses), and
 * `undoStep` undoes the copy against that same table. `afterDuplicate`'s real
 * `invalidateQueries({ queryKey: pagesKey(pondId) })` (and `applyUndoOutcome`'s own
 * `pagesKey()` invalidation on ⌘Z) is what makes the rail refetch — no manual
 * `invalidateQueries` call needed from the test itself.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { duplicatePage } from '@/lib/pages/client'
import { undoStep } from '@/lib/change-log/undo'
import type { PageRow } from '@/lib/pages/tree'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Pond } from '@/lib/pond/client'

const RECIPES_ID = 'recipes'
const AT = '2026-01-01T00:00:00Z'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? RECIPES_ID : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  duplicatePage: jest.fn(),
}))

// Stands in for the `pages` table a real Postgres would hold, the same shape
// `rail-move-undo-path.test.tsx` uses — `duplicatePage` and `undoStep` both
// mutate it, `fetchPages` reads it, so the rail's own refetch (driven by
// `afterDuplicate`'s / `applyUndoOutcome`'s real invalidation) sees the real
// effect of whichever fake RPC ran.
let table: PageRow[]

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => table.map((row) => ({ ...row }))),
}))

jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
}))

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
}

function resetTable() {
  table = [
    { id: RECIPES_ID, parent_id: null, type: 'page', title: 'Recipes', order: 0, updated_at: AT },
    { id: 'chicken', parent_id: RECIPES_ID, type: 'page', title: 'Chicken', order: 0, updated_at: AT },
  ]
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  resetTable()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')

  jest.mocked(duplicatePage).mockImplementation(async () => {
    table.push(
      { id: 'copy-id', parent_id: null, type: 'page', title: 'Recipes 2', order: 1, updated_at: AT },
      { id: 'chicken-copy', parent_id: 'copy-id', type: 'page', title: 'Chicken', order: 0, updated_at: AT }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { id: 'rec-1', targetPageId: 'copy-id' } as any
  })

  jest.mocked(undoStep).mockImplementation(async () => {
    table = table.filter((row) => row.id !== 'copy-id' && row.id !== 'chicken-copy')
    return { outcome: 'done', records: [] }
  })
})

afterEach(() => jest.restoreAllMocks())

it('⌘K "duplicate page" shows the copy below the original, and ⌘Z removes it', async () => {
  const user = userEvent.setup()
  mount()

  await screen.findByRole('treeitem', { name: 'Recipes' })

  await user.keyboard('{Meta>}k{/Meta}')
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  await user.type(input, 'duplicate')
  await user.click(await screen.findByRole('option', { name: /duplicate page/ }))

  await screen.findByRole('treeitem', { name: /Recipes 2/ })

  await user.click(document.body)
  await user.keyboard('{Meta>}z{/Meta}')

  await waitFor(() =>
    expect(screen.queryByRole('treeitem', { name: /Recipes 2/ })).not.toBeInTheDocument()
  )
})
