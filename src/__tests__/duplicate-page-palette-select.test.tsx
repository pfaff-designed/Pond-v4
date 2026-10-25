/**
 * KAN-468: ⌘K "duplicate page" → `ShellCommands`'s `handleDuplicatePage` calls
 * the `duplicatePage` client wrapper, invalidates `['pages']`, and navigates
 * to the copy — same seam `handleCreatePage` already uses for `new page`
 * (`new-page-menu-path.test.tsx`'s "Path test C").
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { duplicatePage } from '@/lib/pages/client'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestComposerNotice } from '@/lib/terminal-focus'
import { workspaceUrl } from '@/lib/pages/nav'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'

const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'recipes' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  duplicatePage: jest.fn(),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest
    .fn()
    .mockResolvedValue([
      { id: 'recipes', parent_id: null, type: 'page', title: 'Recipes', order: 0, updated_at: '' },
    ]),
}))

jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))

const renderShell = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
}

const renderShellWithPond = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )

afterEach(() => jest.clearAllMocks())

const openPaletteAndSelectDuplicate = async (user: ReturnType<typeof userEvent.setup>) => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: 'duplicate' } })
  await user.click(await screen.findByRole('option', { name: /duplicate page/ }))
}

it('⌘K "duplicate page" calls the client wrapper and navigates to the copy', async () => {
  ;(duplicatePage as jest.Mock).mockResolvedValue({ targetPageId: 'recipes-2', title: 'Recipes' })
  const user = userEvent.setup()
  renderShell()

  await openPaletteAndSelectDuplicate(user)

  await waitFor(() => expect(duplicatePage).toHaveBeenCalledTimes(1))
  expect(duplicatePage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'recipes')

  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(mockPush).toHaveBeenCalledWith(
    workspaceUrl({ id: 'recipes-2', type: 'page', title: 'Recipes' })
  )
})

it('a rejecting duplicatePage shows the notice instead of leaving the palette silent', async () => {
  ;(duplicatePage as jest.Mock).mockRejectedValue(new Error('boom'))
  const user = userEvent.setup()
  renderShell()

  await openPaletteAndSelectDuplicate(user)

  await waitFor(() =>
    expect(requestComposerNotice).toHaveBeenCalledWith("can't duplicate the page — try again.")
  )
})

it('remembers the duplicate as one undo step, keyed off the returned record id (KAN-468)', async () => {
  ;(duplicatePage as jest.Mock).mockResolvedValue({ id: 'record-1', targetPageId: 'recipes-2' })
  const user = userEvent.setup()
  renderShellWithPond()

  await openPaletteAndSelectDuplicate(user)

  await waitFor(() => expect(mockRemember).toHaveBeenCalledTimes(1))
  expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['record-1'] })
})
