import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { LinkRecordsProposalCard } from './LinkRecordsProposalCard'

const meta = {
  title: 'Molecules/LinkRecordsProposalCard',
  component: LinkRecordsProposalCard,
  parameters: { layout: 'centered' },
  args: {
    fromRow: 'Stove',
    relation: 'Packs With',
    toRows: ['Tent', 'Rope'],
    reason: 'These pack together.',
    selectedTargetId: 'c-trip',
    targetOptions: [
      { id: 'c-trip', title: 'Trip Packing' },
      { id: 'c-tasks', title: 'Tasks' },
    ],
    onTargetChange: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof LinkRecordsProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: link count, the source row, the relation → targets line, the
 *  collection picker, and the actions. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Link records · 2 links')).toBeInTheDocument()
    await expect(canvas.getByText('Stove')).toBeInTheDocument()
    await expect(canvas.getByText('Packs With')).toBeInTheDocument()
    await expect(canvas.getByText('Tent, Rope')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Link' })).toBeInTheDocument()
    await expect(canvas.getByRole('combobox', { name: 'Source collection' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Link' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Changing the source collection raises onTargetChange with the chosen id. */
export const PickTarget: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Source collection' })
    await userEvent.selectOptions(select, 'c-tasks')
    await expect(args.onTargetChange).toHaveBeenCalledWith('c-tasks')
  },
}

/** A failed accept's reason (no such row / duplicate title) renders on the
 *  still-pending card so the user can retry or dismiss — strict resolution
 *  never wrote anything. */
export const WithError: Story = {
  args: { error: 'No row titled "Lantern" in "Trip Packing"' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('No row titled "Lantern"')
    await expect(canvas.getByRole('button', { name: 'Link' })).toBeInTheDocument()
  },
}

/** Resolved (accepted): picker + actions gone, "Linked" status remains. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Linked')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Link' })).not.toBeInTheDocument()
  },
}

/** Resolved (rejected): "Dismissed" status line. */
export const Rejected: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Dismissed')).toBeInTheDocument()
  },
}
