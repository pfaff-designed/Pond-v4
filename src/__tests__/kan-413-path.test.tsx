/**
 * KAN-413 person's path: boot dark from the OS with nothing stored, follow a live
 * OS change while on `system`, then the breadcrumb's `dark mode` toggle (the REAL
 * `PondCommand`, `aria-label="dark mode"`) makes an explicit choice that stops the
 * following, and a reload (`MODE_BOOT_SCRIPT` re-run on a reset `<html>`) holds it.
 * `matchMedia` mocking mirrors `mode-system.test.ts`'s own harness.
 */

import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PondCommand } from '@/components/organisms/PondCommand'
import { MODE_BOOT_SCRIPT } from '@/lib/theme/mode-boot'

const html = document.documentElement

const mockMatchMedia = (dark: boolean) => {
  let matches = dark
  const listeners = new Set<(event: { matches: boolean }) => void>()
  window.matchMedia = jest.fn().mockReturnValue({
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
  }) as unknown as typeof window.matchMedia
  return {
    fireChange: (next: boolean) => {
      matches = next
      listeners.forEach((listener) => listener({ matches: next }))
    },
  }
}

const runBootScript = () => new Function(MODE_BOOT_SCRIPT)()

const PATH = {
  glyph: 'ramp',
  trail: [{ title: 'life', node: null }],
  current: 'standups',
  role: null,
}

afterEach(() => {
  html.classList.remove('dark')
  window.localStorage.clear()
})

describe('KAN-413 — the person’s path through PondCommand’s dark mode toggle', () => {
  it('boots dark from the OS, follows it live, then an explicit choice holds across reload', async () => {
    const { fireChange } = mockMatchMedia(true)
    runBootScript()

    render(
      <PondCommand
        path={PATH}
        open={false}
        items={[]}
        onSelect={jest.fn()}
        onOpenChange={jest.fn()}
      />
    )
    const toggle = screen.getByRole('button', { name: 'dark mode' })

    expect(html.classList.contains('dark')).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    act(() => fireChange(false))
    await waitFor(() => expect(html.classList.contains('dark')).toBe(false))
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    act(() => fireChange(true))
    await waitFor(() => expect(html.classList.contains('dark')).toBe(true))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    const user = userEvent.setup()
    await user.click(toggle)
    expect(html.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('pond:mode')).toBe('light')
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('false'))

    act(() => fireChange(true))
    expect(html.classList.contains('dark')).toBe(false)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      html.classList.remove('dark')
      runBootScript()
    })
    expect(html.classList.contains('dark')).toBe(false)
  })
})
