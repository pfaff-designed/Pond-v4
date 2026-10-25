/**
 * KAN-469 — ⌘⇧P's ENTRY into `move page to…`'s pick mode: the open page's own
 * chord opens the palette already filtered to candidate targets, with the
 * moving page and its descendants left out and the pond's root offered.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'roof' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([
    { id: 'house', parent_id: null, type: 'page', title: 'House', order: 0, updated_at: '' },
    { id: 'roof', parent_id: null, type: 'page', title: 'Roof', order: 1, updated_at: '' },
    {
      id: 'roof-shingle',
      parent_id: 'roof',
      type: 'page',
      title: 'Shingle',
      order: 0,
      updated_at: '',
    },
  ]),
}))

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShellCommands />
    </QueryClientProvider>
  )

afterEach(() => jest.clearAllMocks())

it('⌘⇧P with "Roof" open shows the picker — House and the root list, Roof and its descendants don\'t', async () => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  renderShell()

  // ⌘K first, so `pages` has settled by the time ⌘⇧P reads it — its own
  // open/close doesn't touch `movePick`, only `handleOpenChange`'s does.
  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.keyDown(document, { key: 'k', metaKey: true })

  fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })

  const input = await screen.findByRole('combobox', { name: 'command palette' })
  expect(input).toHaveAttribute('placeholder', 'move Roof to…')

  expect(await screen.findByRole('option', { name: /House/ })).toBeInTheDocument()
  expect(await screen.findByRole('option', { name: /Life/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /^Roof$/ })).toBeNull()
  expect(screen.queryByRole('option', { name: /Shingle/ })).toBeNull()
})
