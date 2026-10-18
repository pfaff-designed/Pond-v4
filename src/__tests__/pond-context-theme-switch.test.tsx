/**
 * `PondProvider` applies a pond's own theme the moment you switch INTO it
 * mid-session (create, switcher, ⌘K) — never on the first resolution, so a
 * person's own stored mode is never overridden on open (SPEC.md "Consequence
 * of the stored domain"). Mocks `@/lib/pond/client` the same way
 * `pond-context-last-page.test.tsx` does.
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

const INK_POND = { id: 'p-ink', name: 'studio', glyph: null, theme: 'ink', order: 0 }
const PAPER_POND = { id: 'p-paper', name: 'life', glyph: null, theme: 'paper', order: 1 }

const html = document.documentElement
const isDark = () => html.classList.contains('dark')

function Probe() {
  const { pond } = usePond()
  return <div data-testid="probe">{pond ? pond.id : 'none'}</div>
}

beforeEach(() => {
  mockSearch = ''
  html.classList.remove('dark')
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
  ;(listPonds as jest.Mock).mockReset()
})

describe('PondProvider applies a pond theme only on a mid-session switch', () => {
  it('does not touch the dark class on the first resolution (page load)', async () => {
    ;(listPonds as jest.Mock).mockResolvedValue([INK_POND, PAPER_POND])
    mockSearch = 'pond=p-ink'

    render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-ink'))
    expect(isDark()).toBe(false)
  })

  it('applies the newly switched-to pond’s theme on a later rerender', async () => {
    ;(listPonds as jest.Mock).mockResolvedValue([INK_POND, PAPER_POND])
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
    await waitFor(() => expect(isDark()).toBe(true))
  })
})
