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
    onRequestChanges: fn(),
  },
} satisfies Meta<typeof ProposalActions>

export default meta
type Story = StoryObj<typeof meta>

/** Pending card row: accept / reject / request changes, each firing its own intent. */
export const Pending: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'accept' }))
    await userEvent.click(canvas.getByRole('button', { name: 'reject' }))
    await userEvent.click(canvas.getByRole('button', { name: 'request changes' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onReject).toHaveBeenCalledTimes(1)
    await expect(args.onRequestChanges).toHaveBeenCalledTimes(1)
  },
}

/** Group bar: no request changes, relabelled to "accept all / reject all". */
export const GroupBar: Story = {
  args: {
    onRequestChanges: undefined,
    divider: false,
    labels: { accept: 'accept all', reject: 'reject all' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'accept all' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'reject all' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'request changes' })).not.toBeInTheDocument()
  },
}

/** A named accept (W6): "an accept may be named for what it does". */
export const NamedAccept: Story = {
  args: { labels: { accept: 'make page' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'make page' })).toBeInTheDocument()
  },
}

/** Resolved: buttons gone, one status line per status. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('accepted')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

export const Rejected: Story = { args: { status: 'rejected' } }
export const ChangesRequested: Story = {
  args: { status: 'changes_requested' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('changes requested')).toBeInTheDocument()
  },
}
export const Outdated: Story = { args: { status: 'outdated' } }
export const Withdrawn: Story = { args: { status: 'withdrawn' } }
export const Undone: Story = { args: { status: 'undone' } }
export const Reverted: Story = { args: { status: 'reverted' } }
