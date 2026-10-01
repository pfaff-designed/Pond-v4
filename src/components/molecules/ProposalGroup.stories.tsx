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

/** Accept all raises the group intent once. */
export const AcceptAllFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'accept all' }))
    await expect(args.onAcceptAll).toHaveBeenCalledTimes(1)
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
