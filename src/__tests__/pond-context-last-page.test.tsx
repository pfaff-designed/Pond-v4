/**
 * `PondProvider` wiring the write half of `s6m6` ("the page you left stays
 * open for when you come back"): reading `?nodeId=`, running `nextLastPageWrite`
 * (`src/lib/pond/last-page.ts`, its own unit tests), and calling `setPondLastPage`
 * when it says to. Mocks `@/lib/pond/client` and drives `useSearchParams` across
 * rerenders — the `pond-switcher.test.tsx` `mockSearch` pattern.
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

const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const NOISE = { id: 'p-noise', name: 'make noise', glyph: null, theme: 'ink', order: 1 }
const PAGE_X = 'd9f6b2a0-1c3e-4a5b-8f9d-0a1b2c3d4e5f'
const PAGE_Y = 'aa11bb22-cc33-dd44-ee55-ff6677889900'

function Probe() {
  const { pond } = usePond()
  return <div data-testid="probe">{pond ? `${pond.id}:${pond.lastPageId ?? ''}` : 'none'}</div>
}

beforeEach(() => {
  mockSearch = ''
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
  ;(listPonds as jest.Mock).mockResolvedValue([LIFE, NOISE])
})

describe('PondProvider writes ponds.last_page_id', () => {
  it('writes on a same-pond nodeId change', async () => {
    mockSearch = `pond=p-life&nodeId=${PAGE_Y}`
    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-life:'))
    expect(setPondLastPage).not.toHaveBeenCalled()

    mockSearch = `pond=p-life&nodeId=${PAGE_X}`
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )

    await waitFor(() => expect(setPondLastPage).toHaveBeenCalledWith('p-life', PAGE_X))
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`p-life:${PAGE_X}`))
  })

  it('does not write the old nodeId under the newly switched-to pond', async () => {
    mockSearch = `pond=p-life&nodeId=${PAGE_X}`
    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-life:'))

    // `pondHref` never does this itself — it only ever carries the TARGET
    // pond's own `lastPageId`. This models a `?nodeId=` that still names the
    // pond just left (e.g. browser back/forward, a hand-edited URL) landing
    // on the new pond in the same render.
    mockSearch = `pond=p-noise&nodeId=${PAGE_X}`
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-noise:'))
    expect(setPondLastPage).not.toHaveBeenCalled()
  })

  it('does not write when nodeId is unchanged', async () => {
    mockSearch = `pond=p-life&nodeId=${PAGE_X}`
    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-life:'))

    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-life:'))
    expect(setPondLastPage).not.toHaveBeenCalled()
  })

  it('writes null on a same-pond move back to the root', async () => {
    ;(listPonds as jest.Mock).mockResolvedValue([{ ...LIFE, lastPageId: PAGE_X }, NOISE])
    mockSearch = `pond=p-life&nodeId=${PAGE_X}`
    const { rerender } = render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`p-life:${PAGE_X}`))

    // The rail's "life" row, the breadcrumb home, and trashing the open page
    // all drop `?nodeId=` the same way — a same-pond move to the root.
    mockSearch = `pond=p-life`
    rerender(
      <PondProvider>
        <Probe />
      </PondProvider>
    )

    await waitFor(() => expect(setPondLastPage).toHaveBeenCalledWith('p-life', null))
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('p-life:'))
  })
})
