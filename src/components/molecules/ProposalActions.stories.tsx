import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ProposalActions } from './ProposalActions'

const meta = {
  title: 'Molecules/ProposalActions',
  component: ProposalActions,
  parameters: { layout: 'centered' },
  args: {
    status: 'pending',
    onAccept: fn(),
    onReject: fn(),
    onEdit: fn(),
  },
} satisfies Meta<typeof ProposalActions>

export default meta
type Story = StoryObj<typeof meta>

/** Pending single-card row: Accept / Edit / Reject, each firing its own intent. */
export const Pending: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Edit' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Reject' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onEdit).toHaveBeenCalledTimes(1)
    await expect(args.onReject).toHaveBeenCalledTimes(1)
  },
}

/** Group bar: no Edit, relabelled to "Accept all / Reject all". */
export const GroupBar: Story = {
  args: {
    onEdit: undefined,
    divider: false,
    labels: { accept: 'Accept all', reject: 'Reject all' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Accept all' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Reject all' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  },
}

/** Resolved (accepted): buttons gone, status line remains for the audit trail. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Accepted')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

/** Resolved (rejected): rejected status line. */
export const Rejected: Story = {
  args: { status: 'rejected' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Rejected')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}
