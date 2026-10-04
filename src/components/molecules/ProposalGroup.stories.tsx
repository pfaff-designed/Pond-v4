import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ProposalGroup, type ProposalGroupCard } from './ProposalGroup'
import type { ChangePreview } from '@/lib/modules/preview'

const changes: ChangePreview[] = [
  {
    op: 'edit',
    before: { id: 'b', type: 'text', content: 'electrician — provisional, w/c 29 sep' },
    after: { id: '__preview__', type: 'text', content: 'electrician — confirmed, w/c 6 oct' },
  },
  {
    op: 'create',
    before: null,
    after: { id: '__preview__', type: 'text', content: 'worktop template — w/c 13 oct' },
  },
]

function card(id: string, targetName: string, status: ProposalGroupCard['status'] = 'pending') {
  return { id, changes, status, targetName }
}

const meta = {
  title: 'Molecules/ProposalGroup',
  component: ProposalGroup,
  parameters: { layout: 'centered' },
  args: {
    cards: [card('pc1', 'schedule'), card('pc2', 'budget')],
    onAccept: fn(),
    onReject: fn(),
    onRequestChanges: fn(),
    onRevise: fn(),
    onAskAgain: fn(),
    onAcceptAll: fn(),
    onRejectAll: fn(),
  },
} satisfies Meta<typeof ProposalGroup>

export default meta
type Story = StoryObj<typeof meta>

/** Two pages touched: one card each, under an accept all / reject all bar (C10). */
export const TwoCards: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/proposed edit — schedule/)).toBeInTheDocument()
    await expect(canvas.getByText(/proposed edit — budget/)).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'accept all' })).toBeInTheDocument()
  },
}

/** The bar's two intents each fire ONCE for the group, and the count names what
 *  they would take — "2 proposed edits", not "2 changes". */
export const GroupBarFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('2 proposed edits')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'accept all' }))
    await expect(args.onAcceptAll).toHaveBeenCalledTimes(1)
    await userEvent.click(canvas.getByRole('button', { name: 'reject all' }))
    await expect(args.onRejectAll).toHaveBeenCalledTimes(1)
    // The bar decides the group; it never silently decides a single card too.
    await expect(args.onAccept).not.toHaveBeenCalled()
    await expect(args.onReject).not.toHaveBeenCalled()
  },
}

/** Accepting one card raises onAccept with that card's id. */
export const PerCardAccept: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const [, second] = canvas.getAllByRole('button', { name: 'accept' })
    await userEvent.click(second)
    await expect(args.onAccept).toHaveBeenCalledWith('pc2')
  },
}

/** One card settled: with a single card still pending the bar goes away. */
export const OneLeft: Story = {
  args: { cards: [card('pc1', 'schedule', 'accepted'), card('pc2', 'budget')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('accepted')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'accept all' })).not.toBeInTheDocument()
  },
}

/** A single card: no bar — its own footer is enough (C10, 6c single card). */
export const SingleCard: Story = {
  args: { cards: [card('pc1', 'schedule')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'accept all' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'accept' })).toBeInTheDocument()
  },
}
