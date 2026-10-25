/**
 * `patchPond` (KAN-492): a LOCAL-ONLY update of `PondProvider`'s in-memory
 * `ponds` array — no network call, mirrors `addPond`'s `setPonds` shape.
 * `pond-context-last-page.test.tsx`'s mocking and `Probe` pattern.
 */

import React, { useEffect } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PondProvider, usePond, type PondContextValue } from '@/lib/pond/context'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  setPondLastPage: jest.fn(),
}))

import { listPonds, setPondLastPage } from '@/lib/pond/client'

const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const NOISE = { id: 'p-noise', name: 'make noise', glyph: null, theme: 'ink', order: 1 }

// Captured so the blank-name test can call `patchPond` as a plain function —
// React's event dispatch reports an error thrown inside a click handler to
// `console.error` rather than rethrowing it to `fireEvent.click`'s caller.
let capturedPatchPond: PondContextValue['patchPond'] | null = null

function Probe() {
  const { pond, ponds, patchPond, removePond, addPond } = usePond()
  useEffect(() => {
    capturedPatchPond = patchPond
  }, [patchPond])
  const other = ponds.find((p) => p.id !== pond?.id) ?? null
  return (
    <div>
      <div data-testid="active">{pond ? `${pond.name}:${pond.glyph ?? ''}` : 'none'}</div>
      <div data-testid="other">{other ? `${other.name}:${other.glyph ?? ''}` : 'none'}</div>
      <div data-testid="count">{ponds.length}</div>
      <div data-testid="order">{ponds.map((p) => p.name).join(',')}</div>
      <button
        onClick={() => pond && patchPond(pond.id, { name: 'Studio', glyph: 'studio-01' })}
      >
        patch
      </button>
      <button onClick={() => other && removePond(other.id)}>remove</button>
      <button
        onClick={() =>
          addPond({ id: 'p-studio', name: 'Studio', glyph: null, theme: 'paper', order: 1 })
        }
      >
        restore-studio
      </button>
    </div>
  )
}

beforeEach(() => {
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
  ;(listPonds as jest.Mock).mockResolvedValue([LIFE, NOISE])
})

describe('PondProvider patchPond', () => {
  it('updates the active pond in place without touching the other one', async () => {
    render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('life:waves-02'))
    expect(screen.getByTestId('other')).toHaveTextContent('make noise:')

    fireEvent.click(screen.getByText('patch'))

    await waitFor(() =>
      expect(screen.getByTestId('active')).toHaveTextContent('Studio:studio-01')
    )
    expect(screen.getByTestId('other')).toHaveTextContent('make noise:')
    expect(setPondLastPage).not.toHaveBeenCalled()
  })

  it('throws in development on a blank name — an impossible state (KAN-492)', async () => {
    render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('life:waves-02'))

    expect(() => capturedPatchPond!('p-life', { name: '   ' })).toThrow(
      'patchPond: a pond needs a name'
    )
    expect(screen.getByTestId('active')).toHaveTextContent('life:waves-02')
  })

  it('removePond drops exactly that id and leaves the rest of the list untouched (KAN-493)', async () => {
    render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    expect(screen.getByTestId('other')).toHaveTextContent('make noise:')

    fireEvent.click(screen.getByText('remove'))

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(screen.getByTestId('active')).toHaveTextContent('life:waves-02')
    expect(screen.getByTestId('other')).toHaveTextContent('none')
  })

  it('addPond reinserts a restored pond at its old order, not appended at the end (KAN-493)', async () => {
    const STUDIO = { id: 'p-studio', name: 'Studio', glyph: null, theme: 'paper', order: 1 }
    const WORK = { id: 'p-work', name: 'Work', glyph: null, theme: 'paper', order: 2 }
    ;(listPonds as jest.Mock).mockResolvedValueOnce([LIFE, STUDIO, WORK])

    render(
      <PondProvider>
        <Probe />
      </PondProvider>
    )
    await waitFor(() => expect(screen.getByTestId('order')).toHaveTextContent('life,Studio,Work'))

    // Middle delete: drops Studio (order 1), leaving life, Work.
    fireEvent.click(screen.getByText('remove'))
    await waitFor(() => expect(screen.getByTestId('order')).toHaveTextContent('life,Work'))

    // Restore hands the pond's ORIGINAL order (1) straight to `addPond` — a
    // plain append would read `life,Work,Studio` until the next refetch.
    fireEvent.click(screen.getByText('restore-studio'))
    await waitFor(() => expect(screen.getByTestId('order')).toHaveTextContent('life,Studio,Work'))
  })
})
