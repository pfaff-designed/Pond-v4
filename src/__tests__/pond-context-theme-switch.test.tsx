/**
 * The pond theme applies only on an in-session switch (KAN-503) — never at
 * mount/page load, since `PondProvider`'s pond-id ref starts null on every
 * mount and a first resolved pond always reads as "no previous pond" (the
 * same null-across-remounts rule `previousRenderRef` already follows for the
 * last-page write). The explicit `'ink'` theme sets dark outright; a pond
 * with no chosen theme restores the person's own STORED mode (resolving
 * `system`) — so one visit to an ink pond doesn't leave every other pond
 * dark until a manual toggle, and a stale `?pond=` that briefly resolves to
 * no pond can't make the next real switch read as a first load. Mocks
 * `@/lib/pond/client` the same way `pond-context-last-page.test.tsx` does.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { PondProvider, usePond } from '@/lib/pond/context'
import { MODE_KEY } from '@/lib/theme/mode-boot'

let mockSearch = ''

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  setPondLastPage: jest.fn(),
}))

import { listPonds, setPondLastPage } from '@/lib/pond/client'

const PAPER_POND = { id: 'p-paper', name: 'life', glyph: null, theme: 'paper', order: 0 }
const INK_POND = { id: 'p-ink', name: 'studio', glyph: null, theme: 'ink', order: 1 }

const html = document.documentElement
const isDark = () => html.classList.contains('dark')
const setDark = (dark: boolean) => html.classList.toggle('dark', dark)

function Probe() {
  const { pond } = usePond()
  return <div data-testid="probe">{pond ? pond.id : 'none'}</div>
}

beforeEach(() => {
  mockSearch = ''
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
  ;(listPonds as jest.Mock).mockReset().mockResolvedValue([PAPER_POND, INK_POND])
})

afterEach(() => {
  setDark(false)
  window.localStorage.clear()
})

describe('pond theme applies only on an in-session switch', () => {
  it.each([false, true])(
    'mount never applies the theme, even onto the ink pond (starting dark=%s)',
    async (startDark) => {
      setDark(startDark)
      mockSearch = 'pond=p-ink'

      render(
        <PondProvider>
          <Probe />
        </PondProvider>
      )
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-ink'))
      expect(isDark()).toBe(startDark)
    }
  )

  it.each([false, true])(
    'an in-session switch into the ink pond sets dark regardless of the mode at the time (starting dark=%s)',
    async (startDark) => {
      setDark(startDark)
      mockSearch = 'pond=p-paper'

      const { rerender } = render(
        <PondProvider>
          <Probe />
        </PondProvider>
      )
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
      expect(isDark()).toBe(startDark)

      mockSearch = 'pond=p-ink'
      rerender(
        <PondProvider>
          <Probe />
        </PondProvider>
      )
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-ink'))
      expect(isDark()).toBe(true)
    }
  )

  it('stored mode light → switch to the ink pond (dark) → switch to the paper pond (no chosen theme) → back to light', async () => {
    window.localStorage.setItem(MODE_KEY, 'light')
    setDark(false)
    mockSearch = 'pond=p-paper'

    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
    expect(isDark()).toBe(false)

    mockSearch = 'pond=p-ink'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-ink'))
    expect(isDark()).toBe(true)

    // The ticket's own wording: switching into a pond with no chosen theme
    // restores the person's own mode (their stored light) — it does not
    // stand on whatever an earlier switch forced.
    mockSearch = 'pond=p-paper'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
    expect(isDark()).toBe(false)
  })

  it('stored mode dark → switching to the paper pond (no chosen theme) stays dark', async () => {
    window.localStorage.setItem(MODE_KEY, 'dark')
    setDark(true)
    mockSearch = 'pond=p-ink'

    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-ink'))
    expect(isDark()).toBe(true)

    mockSearch = 'pond=p-paper'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
    expect(isDark()).toBe(true)
  })

  it('a stale ?pond= that resolves to no pond does not erase the last real one — the next real switch into ink still applies dark', async () => {
    setDark(false)
    mockSearch = 'pond=p-paper'

    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))

    // A stale pond id (not in the list) resolves to no pond at all.
    mockSearch = 'pond=p-does-not-exist'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('none'))
    expect(isDark()).toBe(false)

    mockSearch = 'pond=p-ink'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-ink'))
    expect(isDark()).toBe(true)
  })
})
