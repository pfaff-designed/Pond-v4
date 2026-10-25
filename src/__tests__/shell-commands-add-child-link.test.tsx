/**
 * KAN-415: ⌘K's "new page" row (`ShellCommands.handleCreatePage`) appends a
 * page-link block to the page in view, the same write seam the rail's ＋ uses
 * (`rail-add-child-link.test.tsx`).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { appendChildLinkUnder } from '@/lib/pages/child-links'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => 'health' }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-page', title: 'groceries' }),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([
    { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: '' },
  ]),
}))

afterEach(() => jest.clearAllMocks())

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

it("⌘K's new page row appends a page-link block to the page in view, not the root", async () => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  const user = userEvent.setup()
  renderShell()

  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: 'groceries' } })

  await user.click(await screen.findByRole('option', { name: /new page/ }))

  await waitFor(() => expect(appendChildLinkUnder).toHaveBeenCalledTimes(1))
  expect(appendChildLinkUnder).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'health',
    'new-page',
    'pond-1',
    'life'
  )
})
