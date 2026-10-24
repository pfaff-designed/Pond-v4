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
jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { createPond } from '@/lib/pond/client'
import { PondContext } from '@/lib/pond/context'

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

describe('ShellCommands — ⌘K while a pond is being made', () => {
  const ACTIVE_POND = { id: 'p-active', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
  // Excluded from the palette's own `new pond "q"` row by `pondItems` filtering
  // out the active pond, so this one both supplies the query match AND is the
  // ponds list's only non-active entry.
  const MATCHING_POND = {
    id: 'p-match',
    name: 'Studio',
    glyph: 'lightning-03',
    theme: 'ink',
    order: 1,
  }

  const renderShellWithPonds = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PondContext.Provider
          value={{
            pond: ACTIVE_POND,
            ponds: [ACTIVE_POND, MATCHING_POND],
            loading: false,
            reload: jest.fn(),
            addPond: jest.fn(),
          }}
        >
          <ShellCommands />
        </PondContext.Provider>
      </QueryClientProvider>
    )

  it('leaves the sheet open and does not raise the list behind it while the create is in flight', async () => {
    onPlatform('MacIntel')
    // Never resolves within the test: `pending` stays true for the whole body,
    // matching the real "⌘K pressed before the create settles" case.
    ;(createPond as jest.Mock).mockReturnValue(new Promise(() => {}))
    renderShellWithPonds()

    press({ metaKey: true })
    fireEvent.change(await screen.findByRole('combobox', LIST), { target: { value: 'studio' } })
    fireEvent.click(await screen.findByRole('option', { name: /new pond/ }))

    const sheet = await screen.findByRole('dialog', { name: 'New pond' })
    expect(screen.getByPlaceholderText('Name your pond')).toHaveValue('studio')

    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    expect(sheet).toHaveTextContent('2 of 2')
    fireEvent.click(screen.getByRole('button', { name: 'make pond' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'make pond' })).toBeDisabled())

    await waitFor(() => expect(screen.queryByRole('combobox', LIST)).toBeNull())
    press({ metaKey: true })

    expect(screen.getByRole('dialog', { name: 'New pond' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', LIST)).toBeNull()
  })

  it('closes the sheet once make pond succeeds, even though pending is still true that tick', async () => {
    onPlatform('MacIntel')
    ;(createPond as jest.Mock).mockResolvedValue({ ...MATCHING_POND, id: 'p-new' })
    renderShellWithPonds()

    press({ metaKey: true })
    fireEvent.change(await screen.findByRole('combobox', LIST), { target: { value: 'studio' } })
    fireEvent.click(await screen.findByRole('option', { name: /new pond/ }))

    await screen.findByRole('dialog', { name: 'New pond' })
    fireEvent.click(screen.getByRole('button', { name: 'continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'make pond' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New pond' })).toBeNull())
  })
})
