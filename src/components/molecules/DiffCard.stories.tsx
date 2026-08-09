import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { DiffCard } from './DiffCard'

const meta = {
  title: 'Molecules/DiffCard',
  component: DiffCard,
  parameters: { layout: 'centered' },
  args: {
    before: 'The old paragraph that needs work.',
    after: 'The new, sharper paragraph.',
    reason: 'Tightened the wording.',
    onAccept: fn(),
    onReject: fn(),
    onEdit: fn(),
  },
} satisfies Meta<typeof DiffCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending proposal: shows before (struck through), after, and the three actions. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The old paragraph that needs work.')).toBeInTheDocument()
    await expect(canvas.getByText('The new, sharper paragraph.')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  },
}

/** Clicking Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Clicking Reject raises onReject exactly once. */
export const RejectFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reject' }))
    await expect(args.onReject).toHaveBeenCalledTimes(1)
  },
}

/** Brand-new content (no `before`) shows a "New content" marker instead of a strike-through. */
export const NewContent: Story = {
  args: { before: '', reason: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New content')).toBeInTheDocument()
    await expect(canvas.getByText('The new, sharper paragraph.')).toBeInTheDocument()
  },
}

/** Resolved (accepted): actions are gone, a status line remains for the audit trail. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Accepted')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  },
}
