import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { PromoteTableProposalCard } from './PromoteTableProposalCard'

const meta = {
  title: 'Molecules/PromoteTableProposalCard',
  component: PromoteTableProposalCard,
  parameters: { layout: 'centered' },
  args: {
    tableTitle: 'Shopping',
    columns: [
      { name: 'Item', type: 'text' },
      { name: 'Price', type: 'number' },
      { name: 'Due', type: 'date' },
    ],
    rowCount: 4,
    reason: 'Turn this table into a tracked collection.',
    selectedTargetId: 'p-workshop',
    targetOptions: [
      { id: 'p-workshop', title: 'Workshop' },
      { id: 'p-garage', title: 'Garage' },
    ],
    onTargetChange: fn(),
    onAccept: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof PromoteTableProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** Pending: column count + row count, the source title, each inferred column with
 *  its type chip, the page picker, and the actions. */
export const Pending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Convert table · 3 columns')).toBeInTheDocument()
    await expect(canvas.getByText('4 rows')).toBeInTheDocument()
    await expect(canvas.getByText('Shopping')).toBeInTheDocument()
    await expect(canvas.getByText('Item')).toBeInTheDocument()
    await expect(canvas.getByText('number')).toBeInTheDocument()
    await expect(canvas.getByText('date')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Convert' })).toBeInTheDocument()
    await expect(canvas.getByRole('combobox', { name: 'Target page' })).toBeInTheDocument()
  },
}

/** Accept raises onAccept exactly once. */
export const AcceptFires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Convert' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** Changing the page raises onTargetChange with the chosen id. */
export const PickTarget: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Target page' })
    await userEvent.selectOptions(select, 'p-garage')
    await expect(args.onTargetChange).toHaveBeenCalledWith('p-garage')
  },
}

/** The proposed page is pre-selected; Accept fires with it intact. */
export const TargetPreselected: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole('combobox', { name: 'Target page' }) as HTMLSelectElement
    await expect(select.value).toBe('p-workshop')
    await userEvent.click(canvas.getByRole('button', { name: 'Convert' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/** An uncaptioned table shows a quiet placeholder rather than a blank line. */
export const Untitled: Story = {
  args: { tableTitle: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Untitled table')).toBeInTheDocument()
  },
}

/** One row reads as singular ("1 row"). */
export const SingleRow: Story = {
  args: { rowCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1 row')).toBeInTheDocument()
  },
}

/** Resolved (accepted): picker + actions gone, "Table converted" status remains. */
export const Accepted: Story = {
  args: { status: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Table converted')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Convert' })).not.toBeInTheDocument()
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
