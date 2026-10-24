/**
 * `patchPond` (KAN-492): a LOCAL-ONLY update of `PondProvider`'s in-memory
 * `ponds` array — no network call, mirrors `addPond`'s `setPonds` shape.
 * `pond-context-last-page.test.tsx`'s mocking and `Probe` pattern.
 */

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PondProvider, usePond } from '@/lib/pond/context'

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

function Probe() {
  const { pond, ponds, patchPond } = usePond()
  const other = ponds.find((p) => p.id !== pond?.id) ?? null
  return (
    <div>
      <div data-testid="active">{pond ? `${pond.name}:${pond.glyph ?? ''}` : 'none'}</div>
      <div data-testid="other">{other ? `${other.name}:${other.glyph ?? ''}` : 'none'}</div>
      <button
        onClick={() => pond && patchPond(pond.id, { name: 'Studio', glyph: 'studio-01' })}
      >
        patch
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
})
