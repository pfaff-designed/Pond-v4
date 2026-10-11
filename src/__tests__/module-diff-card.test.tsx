/**
 * KAN-267 — the guard a `propose_changes` card needs when there is nowhere to
 * accept to. `needsPlace` withholds accept and ⌘↵ and offers the shared
 * `PlaceRow` instead of a click that `resolveAcceptTarget` would send to
 * `accept.ts`'s skip path. Picking a place is the terminal's job (it flips
 * `needsPlace` via a rerender); this only proves the card reacts correctly.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { ModuleDiffCard } from '@/components/molecules/ModuleDiffCard'
import type { ChangePreview } from '@/lib/modules/preview'

const create: ChangePreview = {
  op: 'create',
  before: null,
  after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
}

describe('ModuleDiffCard — needsPlace', () => {
  it('withholds accept and offers a place to pick', () => {
    const onPickPlace = jest.fn()
    render(
      <ModuleDiffCard
        changes={[create]}
        needsPlace
        parentOptions={[{ id: 'cre-1', title: 'Creativity' }]}
        pondName="life"
        onPickPlace={onPickPlace}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'accept' })).toBeDisabled()
    expect(screen.getByText(/need a place to accept to/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'under' })).toBeInTheDocument()
  })

  it('picking a place calls onPickPlace, and the terminal flipping needsPlace enables accept', () => {
    const onPickPlace = jest.fn()
    const { rerender } = render(
      <ModuleDiffCard
        changes={[create]}
        needsPlace
        parentOptions={[{ id: 'cre-1', title: 'Creativity' }]}
        pondName="life"
        onPickPlace={onPickPlace}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'under' }), {
      target: { value: 'cre-1' },
    })
    expect(onPickPlace).toHaveBeenCalledWith('cre-1')

    rerender(
      <ModuleDiffCard
        changes={[create]}
        needsPlace={false}
        parentOptions={[{ id: 'cre-1', title: 'Creativity' }]}
        pondName="life"
        onPickPlace={onPickPlace}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled()
    expect(screen.queryByRole('combobox', { name: 'under' })).not.toBeInTheDocument()
  })
})
