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
import type { ProposalStatus } from '@/components/molecules/ProposalActions'

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

  it('offers only real pages in the under select — no option names the pond root', () => {
    render(
      <ModuleDiffCard
        changes={[create]}
        needsPlace
        parentOptions={[
          { id: 'cre-1', title: 'Creativity' },
          { id: 'kit-1', title: 'Kitchen' },
        ]}
        pondName="life"
        onPickPlace={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    const options = screen.getAllByRole<HTMLOptionElement>('option')
    expect(options.map((o) => o.value)).toEqual(['', 'cre-1', 'kit-1'])
    expect(options.map((o) => o.textContent)).not.toContain('life')
    expect(options[0]).toBeDisabled()
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

  it.each<ProposalStatus>(['outdated', 'changes_requested', 'accepted'])(
    'does not show the place notice or picker on a settled %s card, even if needsPlace is still true',
    (status) => {
      render(
        <ModuleDiffCard
          changes={[create]}
          needsPlace
          status={status}
          parentOptions={[{ id: 'cre-1', title: 'Creativity' }]}
          pondName="life"
          onPickPlace={jest.fn()}
          onAccept={jest.fn()}
          onReject={jest.fn()}
          onRequestChanges={jest.fn()}
        />
      )

      expect(screen.queryByText(/need a place to accept to/)).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: 'under' })).not.toBeInTheDocument()
    }
  )

  it('does not show the place notice or picker on a rejected card unfolded by "show proposal"', () => {
    render(
      <ModuleDiffCard
        changes={[create]}
        needsPlace
        status="rejected"
        parentOptions={[{ id: 'cre-1', title: 'Creativity' }]}
        pondName="life"
        onPickPlace={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'show proposal' }))

    expect(screen.queryByText(/need a place to accept to/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'under' })).not.toBeInTheDocument()
  })
})

describe('ModuleDiffCard — skippedReasons', () => {
  it('collapses identical reasons to one line carrying the count', () => {
    render(
      <ModuleDiffCard
        changes={[create]}
        skippedCount={4}
        skippedReasons={[
          'no target page to write to',
          'no target page to write to',
          'no target page to write to',
          'no target page to write to',
        ]}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    const note = screen.getByRole('note')
    expect(note.querySelectorAll('p')).toHaveLength(1)
    expect(screen.getByText('4 changes couldn’t be placed — no target page to write to')).toBeInTheDocument()
  })

  it('renders one line per distinct reason', () => {
    render(
      <ModuleDiffCard
        changes={[create]}
        skippedCount={2}
        skippedReasons={['no target page to write to', 'block type not supported']}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onRequestChanges={jest.fn()}
      />
    )

    const note = screen.getByRole('note')
    expect(note.querySelectorAll('p')).toHaveLength(2)
    expect(screen.getByText('1 change couldn’t be placed — no target page to write to')).toBeInTheDocument()
    expect(screen.getByText('1 change couldn’t be placed — block type not supported')).toBeInTheDocument()
  })
})
