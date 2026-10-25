/**
 * The pond theme applies only on an in-session switch (KAN-503) — never at
 * mount/page load, since `PondProvider`'s pond-id ref starts null on every
 * mount and a first resolved pond always reads as "no previous pond" (the
 * same null-across-remounts rule `previousRenderRef` already follows for the
 * last-page write). Only the explicit `'ink'` theme maps to a mode; every
 * other value, paper's column default included, is a no-op — the person's
 * own mode stands, even right after an earlier switch forced it dark. Mocks
 * `@/lib/pond/client` the same way `pond-context-last-page.test.tsx` does.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { PondProvider, usePond } from '@/lib/pond/context'

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

  it('a switch into the paper pond is a no-op, leaving the mode exactly as it stood — even right after an ink switch', async () => {
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

    // The PATH_STEPS case: switching into a pond with no chosen theme after an
    // ink switch stands dark — it never reverts to light just because paper
    // is the column default.
    mockSearch = 'pond=p-paper'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
    expect(isDark()).toBe(true)
  })
})
