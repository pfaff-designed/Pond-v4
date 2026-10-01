/**
 * #98 — the diff card against board 6c (`Pond 06.03 Propose and accept`) and the
 * "Decided, 26 sep" rules in AUDIT.md.
 *
 *   - buttons are accept / reject / request changes; accept and reject take the
 *     WHOLE diff (one card, one decision, N changes inside it);
 *   - request changes opens a note under the card, addressed "to pond";
 *   - G2: an outdated card greys out, loses accept, offers revise;
 *   - C10: "accept all" only when there is more than one card;
 *   - W6: all eight statuses render, each distinctly;
 *   - red `#C55347` (the removal role) marks removals and nothing else;
 *   - "show original" is available alongside the diff;
 *   - reject leaves one line, "rejected — nothing changed", with show proposal.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModuleDiffCard } from '@/components/molecules/ModuleDiffCard'
import { ProposalGroup, type ProposalGroupCard } from '@/components/molecules/ProposalGroup'
import type { ProposalStatus } from '@/components/molecules/ProposalActions'
import type { ChangePreview } from '@/lib/modules/preview'

const edit: ChangePreview = {
  op: 'edit',
  before: { id: 'b1', type: 'text', content: 'electrician — provisional, w/c 29 sep' },
  after: { id: '__preview__', type: 'text', content: 'electrician — confirmed, w/c 6 oct' },
}
const create: ChangePreview = {
  op: 'create',
  before: null,
  after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
  reason: 'the worktop follows the electrician by a week',
}
const remove: ChangePreview = {
  op: 'remove',
  before: { id: 'm1', type: 'metric', label: 'Weekly mileage', value: 38, unit: 'mi' },
  after: null,
}

const handlers = () => ({
  onAccept: jest.fn(),
  onReject: jest.fn(),
  onRequestChanges: jest.fn(),
  onRevise: jest.fn(),
  onAskAgain: jest.fn(),
})

/** Elements painted in the removal role — the ONLY red on the surface. */
function removalMarks(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[class*="mn-signal-removal"]'))
}

describe('ModuleDiffCard — one card, whole diff', () => {
  it('renders the batch as one card: header, count, every change, three buttons', () => {
    const h = handlers()
    render(<ModuleDiffCard changes={[edit, create]} targetName="schedule" {...h} />)
    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(within(card).getByText(/proposed edit — schedule/)).toBeInTheDocument()
    expect(within(card).getByText('2 changes')).toBeInTheDocument()
    expect(within(card).getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
    expect(within(card).getByText('worktop template — w/c 13 oct')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'accept' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'reject' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'request changes' })).toBeInTheDocument()
    // Nothing per-change: there is exactly ONE accept, and no edit verb anywhere.
    expect(screen.getAllByRole('button', { name: 'accept' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept all/i })).not.toBeInTheDocument()
  })

  it('a single change reads "1 change"', () => {
    render(<ModuleDiffCard changes={[create]} targetName="schedule" {...handlers()} />)
    expect(screen.getByText('1 change')).toBeInTheDocument()
  })

  it('accept and reject fire once for the whole card', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<ModuleDiffCard changes={[edit, create]} targetName="schedule" {...h} />)
    await user.click(screen.getByRole('button', { name: 'accept' }))
    expect(h.onAccept).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'reject' }))
    expect(h.onReject).toHaveBeenCalledTimes(1)
  })
})

describe('ModuleDiffCard — request changes opens a note to pond (6c frame 3)', () => {
  it('opens the note under the card, sends it, and can be cancelled', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<ModuleDiffCard changes={[edit, create]} targetName="schedule" {...h} />)
    expect(screen.queryByRole('textbox', { name: 'note to pond' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'request changes' }))
    expect(screen.getByText('to pond')).toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'note to pond' })
    // Nothing to send yet.
    expect(screen.getByRole('button', { name: 'send' })).toBeDisabled()

    await user.type(box, "keep the electrician, but the worktop can't be the 13th")
    await user.click(screen.getByRole('button', { name: 'send' }))
    expect(h.onRequestChanges).toHaveBeenCalledWith(
      "keep the electrician, but the worktop can't be the 13th"
    )
  })

  it('cancel closes the note and sends nothing', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<ModuleDiffCard changes={[edit]} targetName="schedule" {...h} />)
    await user.click(screen.getByRole('button', { name: 'request changes' }))
    await user.type(screen.getByRole('textbox', { name: 'note to pond' }), 'x')
    await user.click(screen.getByRole('button', { name: 'cancel' }))
    expect(screen.queryByRole('textbox', { name: 'note to pond' })).not.toBeInTheDocument()
    expect(h.onRequestChanges).not.toHaveBeenCalled()
  })

  it('a changes-requested card is inert and shows the note that was sent', () => {
    render(
      <ModuleDiffCard
        changes={[edit, create]}
        targetName="schedule"
        status="changes_requested"
        note="keep the electrician, drop the worktop"
        {...handlers()}
      />
    )
    expect(screen.getByText('changes requested')).toBeInTheDocument()
    expect(screen.getByText('keep the electrician, drop the worktop')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'request changes' })).not.toBeInTheDocument()
  })

  it('a revised card says so in its header', () => {
    render(<ModuleDiffCard changes={[edit]} targetName="schedule" revised {...handlers()} />)
    expect(screen.getByRole('group', { name: /revised edit/ })).toBeInTheDocument()
    expect(screen.getByText(/revised edit — schedule/)).toBeInTheDocument()
  })
})

describe('ModuleDiffCard — outdated (G2)', () => {
  it('greys out, loses accept, offers revise', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(<ModuleDiffCard changes={[edit]} targetName="schedule" status="outdated" {...h} />)
    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(card).toHaveAttribute('data-status', 'outdated')
    expect(card.className).toMatch(/opacity-/)
    expect(within(card).getByText('outdated')).toBeInTheDocument()
    expect(within(card).getByText(/page changed after this was proposed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'request changes' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'revise' }))
    expect(h.onRevise).toHaveBeenCalledTimes(1)
  })
})

describe('ModuleDiffCard — the eight statuses render distinctly (W6)', () => {
  const settled: Exclude<ProposalStatus, 'pending'>[] = [
    'accepted',
    'rejected',
    'changes_requested',
    'outdated',
    'withdrawn',
    'undone',
    'reverted',
  ]

  it.each(settled)('%s carries its own label and no live decision buttons', (status) => {
    const { container } = render(
      <ModuleDiffCard changes={[edit]} targetName="schedule" status={status} {...handlers()} />
    )
    expect(container.querySelector('[data-status]')).toHaveAttribute('data-status', status)
    const expected = status === 'changes_requested' ? 'changes requested' : status
    const line = container.querySelector('[data-part="status"]')
    expect(line?.textContent).toContain(expected)
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'reject' })).not.toBeInTheDocument()
  })

  it('pending is the eighth: the live card with its three buttons', () => {
    const { container } = render(
      <ModuleDiffCard changes={[edit]} targetName="schedule" {...handlers()} />
    )
    expect(container.querySelector('[data-status]')).toHaveAttribute('data-status', 'pending')
    expect(screen.getByRole('button', { name: 'accept' })).toBeInTheDocument()
  })

  it('the seven settled labels are all different from one another', () => {
    const labels = settled.map((status) => {
      const { container, unmount } = render(
        <ModuleDiffCard changes={[edit]} targetName="schedule" status={status} {...handlers()} />
      )
      const text = container.querySelector('[data-part="status"]')?.textContent?.trim()
      unmount()
      return text
    })
    expect(new Set(labels).size).toBe(settled.length)
  })
})

describe('ModuleDiffCard — reject leaves one line (6c frame 5)', () => {
  it('collapses to "rejected — nothing changed" with show proposal and ask again', async () => {
    const user = userEvent.setup()
    const h = handlers()
    render(
      <ModuleDiffCard changes={[edit, create]} targetName="schedule" status="rejected" {...h} />
    )
    expect(screen.getByText('rejected — nothing changed')).toBeInTheDocument()
    // The diff is folded away until asked for.
    expect(screen.queryByText('electrician — confirmed, w/c 6 oct')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'show proposal' }))
    expect(screen.getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ask again' }))
    expect(h.onAskAgain).toHaveBeenCalledTimes(1)
  })
})

describe('ModuleDiffCard — red is removals, and nothing else', () => {
  it('additions and edits’ new text carry no removal mark', () => {
    const { container } = render(
      <ModuleDiffCard changes={[create]} targetName="schedule" {...handlers()} />
    )
    expect(removalMarks(container)).toHaveLength(0)
  })

  it('a removal and an edit’s struck "before" are the only red', () => {
    const { container } = render(
      <ModuleDiffCard changes={[edit, remove]} targetName="schedule" {...handlers()} />
    )
    const marks = removalMarks(container)
    expect(marks.length).toBeGreaterThan(0)
    // Each red element sits inside a removal row, never in an addition.
    for (const el of marks) {
      expect(el.closest('[data-part="removal"]')).not.toBeNull()
    }
    // The proposed text is ink.
    const added = screen.getByText('electrician — confirmed, w/c 6 oct')
    expect(added.closest('[data-part="removal"]')).toBeNull()
  })

  it('show original swaps the diff for the target as it stands, with no red at all', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ModuleDiffCard changes={[edit, remove, create]} targetName="schedule" {...handlers()} />
    )
    await user.click(screen.getByRole('button', { name: 'show original' }))
    const original = container.querySelector('[data-part="original"]')
    expect(original).not.toBeNull()
    expect(
      within(original as HTMLElement).getByText('electrician — provisional, w/c 29 sep')
    ).toBeInTheDocument()
    expect(within(original as HTMLElement).getByText('Weekly mileage')).toBeInTheDocument()
    // A create has no original; say so rather than showing nothing.
    expect(within(original as HTMLElement).getByText(/new block/)).toBeInTheDocument()
    expect(removalMarks(container)).toHaveLength(0)
    // The proposed text is not on screen while the original is.
    expect(screen.queryByText('electrician — confirmed, w/c 6 oct')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'show diff' }))
    expect(screen.getByText('electrician — confirmed, w/c 6 oct')).toBeInTheDocument()
  })
})

describe('ProposalGroup — accept all only with more than one card (C10)', () => {
  function card(id: string, status: ProposalStatus = 'pending'): ProposalGroupCard {
    return { id, changes: [edit, create], status, targetName: id }
  }
  const groupHandlers = () => ({
    onAccept: jest.fn(),
    onReject: jest.fn(),
    onRequestChanges: jest.fn(),
    onRevise: jest.fn(),
    onAcceptAll: jest.fn(),
    onRejectAll: jest.fn(),
  })

  it('a single card has no accept all', () => {
    render(<ProposalGroup cards={[card('schedule')]} {...groupHandlers()} />)
    expect(screen.queryByRole('button', { name: 'accept all' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'accept' })).toBeInTheDocument()
  })

  it('two pending cards show accept all / reject all, which fire once', async () => {
    const user = userEvent.setup()
    const h = groupHandlers()
    render(<ProposalGroup cards={[card('schedule'), card('budget')]} {...h} />)
    await user.click(screen.getByRole('button', { name: 'accept all' }))
    expect(h.onAcceptAll).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'reject all' }))
    expect(h.onRejectAll).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2 proposed edits')).toBeInTheDocument()
  })

  it('once only one card is still pending, accept all goes away', () => {
    render(
      <ProposalGroup cards={[card('schedule', 'accepted'), card('budget')]} {...groupHandlers()} />
    )
    expect(screen.queryByRole('button', { name: 'accept all' })).not.toBeInTheDocument()
  })

  it('per-card decisions are raised with that card’s id', async () => {
    const user = userEvent.setup()
    const h = groupHandlers()
    render(<ProposalGroup cards={[card('schedule'), card('budget')]} {...h} />)
    const [, second] = screen.getAllByRole('button', { name: 'accept' })
    await user.click(second)
    expect(h.onAccept).toHaveBeenCalledWith('budget')
  })
})
