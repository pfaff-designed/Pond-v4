/**
 * The pond theme applies at creation only (KAN-501 scope cut; applying it on
 * switch moved to KAN-503). `PondProvider` must never flip the mode just
 * because `?pond=` changed — every existing pond defaults to `theme: 'paper'`
 * (0018), so applying it on switch would stomp a person's own dark mode
 * (KAN-413). Mocks `@/lib/pond/client` the same way
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

const PAPER_POND = { id: 'p-paper', name: 'life', glyph: null, theme: 'paper', order: 0 }
const INK_POND = { id: 'p-ink', name: 'studio', glyph: null, theme: 'ink', order: 1 }

const html = document.documentElement
const isDark = () => html.classList.contains('dark')

function Probe() {
  const { pond } = usePond()
  return <div data-testid="probe">{pond ? pond.id : 'none'}</div>
}

beforeEach(() => {
  mockSearch = ''
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
  ;(listPonds as jest.Mock).mockReset().mockResolvedValue([PAPER_POND, INK_POND])
})

describe('switching ponds never changes the mode', () => {
  it('leaves a dark mode unchanged across paper -> ink -> paper', async () => {
    html.classList.add('dark')
    mockSearch = 'pond=p-paper'

    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
    expect(isDark()).toBe(true)

    mockSearch = 'pond=p-ink'
    rerender(
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

    html.classList.remove('dark')
  })

  it('leaves a light mode unchanged across paper -> ink -> paper', async () => {
    html.classList.remove('dark')
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
    expect(isDark()).toBe(false)

    mockSearch = 'pond=p-paper'
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-paper'))
    expect(isDark()).toBe(false)
  })
})
