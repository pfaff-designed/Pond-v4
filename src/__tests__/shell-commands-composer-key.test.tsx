/**
 * ⌘J (`Pond 02` 2f): the shell's key owner asks the composer to open or close, from
 * anywhere — a text field included — and leaves every other chord alone. ⌘K stays
 * the palette's.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { TOGGLE_COMPOSER_EVENT } from '@/lib/terminal-focus'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
      <textarea aria-label="somewhere to type" />
    </QueryClientProvider>
  )

describe('ShellCommands — ⌘J toggles the composer', () => {
  let toggled: jest.Mock

  beforeEach(() => {
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    toggled = jest.fn()
    window.addEventListener(TOGGLE_COMPOSER_EVENT, toggled)
  })

  afterEach(() => {
    window.removeEventListener(TOGGLE_COMPOSER_EVENT, toggled)
    jest.restoreAllMocks()
  })

  it('fires from inside a text field, and the browser never sees the key', () => {
    renderShell()
    const field = screen.getByLabelText('somewhere to type')
    field.focus()

    const notPrevented = fireEvent.keyDown(field, { key: 'j', metaKey: true })

    expect(toggled).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
  })

  it('a held key toggles once: repeats are swallowed, not passed on', () => {
    renderShell()
    fireEvent.keyDown(document.body, { key: 'j', metaKey: true })
    const repeatNotPrevented = fireEvent.keyDown(document.body, {
      key: 'j',
      metaKey: true,
      repeat: true,
    })

    expect(toggled).toHaveBeenCalledTimes(1)
    expect(repeatNotPrevented).toBe(false)
  })

  it('is Cmd on a Mac — Ctrl+J is left to the browser', () => {
    renderShell()
    const notPrevented = fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true })

    expect(toggled).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('is Ctrl off a Mac', () => {
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    renderShell()

    fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'j', metaKey: true })

    expect(toggled).toHaveBeenCalledTimes(1)
  })

  it('leaves ⌘K to the palette', () => {
    renderShell()
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    expect(toggled).not.toHaveBeenCalled()
  })
})
