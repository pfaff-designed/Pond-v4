import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ConfigureViewProposalCard } from './ConfigureViewProposalCard'

const meta = {
  title: 'Molecules/ConfigureViewProposalCard',
  component: ConfigureViewProposalCard,
  parameters: { layout: 'centered' },
  args: {
    mode: 'board',
    groupBy: 'Status',
    sort: { key: 'Due', dir: 'asc' },
    filter: { property: 'Status', op: 'eq', value: 'Reading' },
    reason: 'A board grouped by status for the tasks.',
    selectedTargetId: 'c-tasks',
    targetOptions: [
      { id: 'c-tasks', title: 'Tasks' },
      { id: 'c-reading', title: 'Reading List' },
    ],
    onTargetChange: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof ConfigureViewProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: the mode, each proposed clause, the collection picker, and the actions. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New view · Board')).toBeInTheDocument()
    await expect(canvas.getByText('Grouped by')).toBeInTheDocument()
    await expect(canvas.getByText('Status')).toBeInTheDocument()
    await expect(canvas.getByText('Sorted by')).toBeInTheDocument()
    await expect(canvas.getByText('Due ↑')).toBeInTheDocument()
    await expect(canvas.getByText('Filtered')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Apply view' })).toBeInTheDocument()
    await expect(canvas.getByRole('combobox', { name: 'Target collection' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Apply view' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Changing the collection raises onTargetChange with the chosen id. */
export const PickTarget: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Target collection' })
    await userEvent.selectOptions(select, 'c-reading')
    await expect(args.onTargetChange).toHaveBeenCalledWith('c-reading')
  },
}

/** A bare table view (no clauses) shows just the mode — no config rows. */
export const BareTable: Story = {
  args: { mode: 'table', groupBy: undefined, sort: undefined, filter: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('New view · Table')).toBeInTheDocument()
    await expect(canvas.queryByText('Grouped by')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Sorted by')).not.toBeInTheDocument()
  },
}

/** Resolved (accepted): picker + actions gone, "View configured" status remains. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('View configured')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Apply view' })).not.toBeInTheDocument()
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

/**
 * #52 fix 2 — accepting a SECOND configure_view switches the collection's one active
 * view; the receipt says so honestly ("Switched active view · replaced the previous
 * view") instead of the flat "View configured".
 */
export const AcceptedReplacedActiveView: Story = {
  args: { status: 'accepted', replacedActiveView: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Switched active view · replaced the previous view')
    ).toBeInTheDocument()
  },
}
