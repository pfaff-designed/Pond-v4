/**
 * KAN-475's ⌘K wiring: `ShellCommands` passes `pond?.favouritePageIds` into
 * `paletteItems()` and routes `favourite-page`/`unfavourite-page` through
 * `useFavouritePage`'s hook rather than handling the toggle itself. Walked
 * through the real `PondProvider` (same shape as `rail-pond-rename-path.test.tsx`)
 * so the optimistic `patchPond` write is the real one, not a stub — the row's
 * label flip on reopen is the proof the pond's `favouritePageIds` actually
 * changed, not just that a click handler ran.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { PondProvider } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { PageRow } from '@/lib/pages/tree'

const POND_ID = 'pond-1'
const PAGE_ID = 'groceries'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? PAGE_ID : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  })),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(),
}))

jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))

jest.mock('@/lib/pond/client', () => ({
  ...jest.requireActual('@/lib/pond/client'),
  listPonds: jest.fn(),
  setPondLastPage: jest.fn().mockResolvedValue(undefined),
  setPondFavourites: jest.fn(),
}))

import { fetchPages } from '@/lib/pages/tree'
import { listPonds, setPondFavourites, type Pond } from '@/lib/pond/client'

const PAGES: PageRow[] = [
  { id: PAGE_ID, parent_id: null, type: 'page', title: 'groceries', order: 0, updated_at: '2026-01-01' },
]

let pondRow: Pond

beforeEach(() => {
  jest.clearAllMocks()
  pondRow = { id: POND_ID, name: 'life', glyph: null, theme: 'light', order: 0 }
  jest.mocked(fetchPages).mockResolvedValue(PAGES.map((r) => ({ ...r })))
  jest.mocked(listPonds).mockImplementation(async () => [pondRow])
  jest.mocked(setPondFavourites).mockImplementation(async (_pondId: string, ids: string[]) => {
    pondRow = { ...pondRow, favouritePageIds: ids }
  })
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

function renderPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PondProvider>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </PondProvider>
    </QueryClientProvider>
  )
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Meta>}k{/Meta}')
  return screen.findByRole('combobox', { name: 'command palette' })
}

describe("⌘K's favourite/unfavourite row toggles the open page (KAN-475)", () => {
  it('favourites the open page, and the row flips to unfavourite on reopen', async () => {
    const user = userEvent.setup()
    renderPath()

    const input = await openPalette(user)
    await user.type(input, 'favourite')
    const findOption = async (label: RegExp) => {
      const options = await screen.findAllByRole('option')
      return options.find((o) => label.test(o.textContent ?? ''))
    }

    const row = await findOption(/^>favourite this page/)
    expect(row).not.toBeUndefined()
    expect(await findOption(/^>unfavourite this page/)).toBeUndefined()
    await user.click(row!)

    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [PAGE_ID])
    )
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'command palette' })).not.toBeInTheDocument()
    )

    const reopened = await openPalette(user)
    await user.type(reopened, 'favourite')
    await waitFor(async () => expect(await findOption(/^>unfavourite this page/)).not.toBeUndefined())
    expect(await findOption(/^>favourite this page/)).toBeUndefined()

    const unfavouriteRow = await findOption(/^>unfavourite this page/)
    await user.click(unfavouriteRow!)
    await waitFor(() => expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, []))
  })
})
