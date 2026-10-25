/**
 * KAN-396's own path test: on Windows, the breadcrumb chip reads `Ctrl K` and,
 * once the palette is opened the person's way (⌃K), the `zen` row reads
 * `Ctrl .` too — both off the real shell, not the formatter alone.
 *
 * Also the ticket's "try to break it" cases: an iPadOS UA still reads Apple; a
 * shift chord orders Ctrl/⌘ correctly; every `aria-keyshortcuts` this ticket
 * touches (the breadcrumb opener, the composer tab opener) is a single
 * platform's WAI-ARIA token list, never the old `"Meta+K Control+K"` pair.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({ blocks: [] }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { TerminalDrawer } from '@/components/molecules/TerminalDrawer'
import { ariaKeyshortcuts, formatChord } from '@/lib/shell-commands'

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

afterEach(() => jest.restoreAllMocks())

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

/** A single WAI-ARIA shortcut: `+`-joined modifiers, then one key — never a
 * space, which would mean a second, space-joined alternative riding along. */
const ARIA_KEYSHORTCUTS = /^((Alt|Control|Meta|Shift)\+)*[^\s+]+$/

describe('KAN-396 path — ⌃K off a Mac opens the palette, and the chip and the zen row both read Ctrl', () => {
  it('shows the Ctrl K chip at rest, then Ctrl . on the zen row once opened', async () => {
    onPlatform('Win32')
    const user = userEvent.setup()
    renderShell()

    expect(document.querySelector('[data-part="chip"]')!.textContent).toBe('Ctrl K')

    await user.keyboard('{Control>}k{/Control}')
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'zen')
    // The typed query's own first row is selected (its hint traded for ↵) —
    // move off it so the zen row's key hint shows.
    await user.keyboard('{ArrowDown}')

    const zenRow = screen
      .getAllByRole('option')
      .find((row) => row.querySelector('[data-part="label"]')?.textContent === 'zen')!
    expect(zenRow.querySelector('[data-part="hint"]')!.textContent).toBe('Ctrl .')
  })
})

describe('KAN-396 try to break it — an iPadOS UA (MacIntel reporting an iPad) still reads Apple', () => {
  it('keeps the ⌘K chip on the shell', () => {
    onPlatform('iPad')
    renderShell()
    expect(document.querySelector('[data-part="chip"]')!.textContent).toBe('⌘K')
  })
})

describe('KAN-396 try to break it — a shift chord orders the modifiers correctly on both platforms', () => {
  it('reads ⇧⌘Z on a Mac', () => {
    onPlatform('MacIntel')
    expect(formatChord('mod+shift+z')).toBe('⇧⌘Z')
  })

  it('reads Ctrl Shift Z off a Mac', () => {
    onPlatform('Win32')
    expect(formatChord('mod+shift+z')).toBe('Ctrl Shift Z')
  })
})

describe('KAN-396 try to break it — every aria-keyshortcuts value this ticket touches is a single platform, never a space-joined pair', () => {
  it.each(['Win32', 'MacIntel'])('the breadcrumb opener on %s', (platform) => {
    onPlatform(platform)
    const { unmount } = renderShell()
    const value = document.querySelector('[data-part="opener"]')!.getAttribute('aria-keyshortcuts')!
    expect(value).toMatch(ARIA_KEYSHORTCUTS)
    unmount()
  })

  it.each(['Win32', 'MacIntel'])('the composer tab opener on %s', (platform) => {
    onPlatform(platform)
    const { unmount } = render(
      <TerminalDrawer collapsed onExpand={jest.fn()} footer={null}>
        {null}
      </TerminalDrawer>
    )
    const value = document.querySelector('button')!.getAttribute('aria-keyshortcuts')!
    expect(value).toMatch(ARIA_KEYSHORTCUTS)
    unmount()
  })

  it('never re-lists the other platform’s modifier alongside this one’s', () => {
    onPlatform('MacIntel')
    expect(ariaKeyshortcuts('mod+k')).toBe('Meta+K')
    onPlatform('Win32')
    expect(ariaKeyshortcuts('mod+k')).toBe('Control+K')
  })
})
