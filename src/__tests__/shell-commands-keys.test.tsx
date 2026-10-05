/**
 * ⌘K has one owner: `ShellCommands`. It opens the palette, closes it, and closes
 * the save-as-template sheet the palette becomes (`Pond 06.09` frame 3) — and a
 * press while the sheet is open must not raise the list behind it. `PondCommand`
 * itself handles a click on it, esc and a press outside, and nothing else. A close
 * is a 150ms collapse, so the list leaves once it has finished.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'budget' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({ blocks: [] }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([
    {
      id: 'budget',
      title: 'budget',
      parent_id: null,
      type: 'page',
      order: 0,
      updated_at: '',
    },
  ]),
  insertPageOptimistic: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'

const LIST = { name: 'command palette' }
const SHEET = { name: 'Template name' }

const renderShell = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ShellCommands />
    </QueryClientProvider>
  )

const press = (init: KeyboardEventInit) => fireEvent.keyDown(document, { key: 'k', ...init })

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

describe('ShellCommands — ⌘K is Ctrl+K off a Mac, and never both on one platform', () => {
  it('a Mac: ⌘K toggles; Ctrl+K does nothing', async () => {
    onPlatform('MacIntel')
    renderShell()
    press({ ctrlKey: true })
    expect(screen.queryByRole('combobox', LIST)).toBeNull()
    press({ metaKey: true })
    expect(await screen.findByRole('combobox', LIST)).toBeInTheDocument()
    press({ metaKey: true })
    await waitFor(() => expect(screen.queryByRole('combobox', LIST)).toBeNull())
  })

  it('elsewhere: Ctrl+K toggles; the Windows key does nothing', async () => {
    onPlatform('Win32')
    renderShell()
    press({ metaKey: true })
    expect(screen.queryByRole('combobox', LIST)).toBeNull()
    press({ ctrlKey: true })
    expect(await screen.findByRole('combobox', LIST)).toBeInTheDocument()
    press({ ctrlKey: true })
    await waitFor(() => expect(screen.queryByRole('combobox', LIST)).toBeNull())
  })
})

describe('ShellCommands — ⌘K while the save-as-template sheet is open', () => {
  it('closes the sheet and does not raise the list behind it', async () => {
    onPlatform('MacIntel')
    renderShell()
    press({ metaKey: true })
    fireEvent.change(await screen.findByRole('combobox', LIST), { target: { value: '>' } })
    fireEvent.click(await screen.findByRole('option', { name: /save page as template/ }))
    expect(await screen.findByRole('textbox', SHEET)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', LIST)).toBeNull()

    press({ metaKey: true })

    await waitFor(() => expect(screen.queryByRole('textbox', SHEET)).toBeNull())
    expect(screen.queryByRole('combobox', LIST)).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()

    press({ metaKey: true })
    expect(await screen.findByRole('combobox', LIST)).toBeInTheDocument()
  })
})
