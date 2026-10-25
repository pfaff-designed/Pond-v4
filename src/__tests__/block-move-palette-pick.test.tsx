/**
 * KAN-479 slice 1 — the block menu's `move to…` ENTRY into the ⌘K palette's
 * block-pick mode: `requestBlockMovePick` (`BlockCanvas`'s decoupled ask)
 * opens the picker already filtered to candidate target pages, with the
 * block's own source page absent and no database offered either. Esc
 * closes it with no write — the select branch is wired in a later pass.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestBlockMovePick } from '@/lib/terminal-focus'
import { movePage } from '@/lib/pages/client'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'verify' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))

jest.mock('@/lib/pages/client', () => ({
  movePage: jest.fn(),
  createPage: jest.fn(),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  duplicatePage: jest.fn(),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([
    { id: 'verify', parent_id: null, type: 'page', title: 'Verify', order: 0, updated_at: '' },
    { id: 'house', parent_id: null, type: 'page', title: 'House', order: 1, updated_at: '' },
    { id: 'dbs', parent_id: null, type: 'page', title: 'databases', order: 2, updated_at: '' },
    { id: 'tasks', parent_id: 'dbs', type: 'page', title: 'Tasks', order: 0, updated_at: '' },
  ]),
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

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )

beforeEach(() => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

it('a block move-pick request opens the picker with every page but the source and the databases root', async () => {
  renderShell()

  act(() => requestBlockMovePick({ blockId: 'block-1', sourcePageId: 'verify', label: 'checklist' }))

  const input = await screen.findByRole('combobox', { name: 'command palette' })
  expect(input).toHaveAttribute('placeholder', 'move checklist to…')

  expect(await screen.findByRole('option', { name: /House/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /^Verify$/ })).toBeNull()
  expect(screen.queryByRole('option', { name: /databases/i })).toBeNull()
  expect(screen.queryByRole('option', { name: /Tasks/ })).toBeNull()
})

it('Esc closes the block move picker with no write', async () => {
  renderShell()

  act(() => requestBlockMovePick({ blockId: 'block-1', sourcePageId: 'verify', label: 'checklist' }))
  await screen.findByRole('combobox', { name: 'command palette' })

  fireEvent.keyDown(document, { key: 'Escape' })

  await waitFor(() =>
    expect(screen.queryByRole('combobox', { name: 'command palette' })).not.toBeInTheDocument()
  )
  expect(movePage).not.toHaveBeenCalled()
})
