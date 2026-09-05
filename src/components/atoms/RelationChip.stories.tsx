import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RelationChip } from './RelationChip'

const meta = {
  title: 'Atoms/RelationChip',
  component: RelationChip,
  parameters: { layout: 'centered' },
  args: {
    id: 'page-42',
    title: 'The Odyssey',
    onOpen: fn(),
  },
} satisfies Meta<typeof RelationChip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The Odyssey')).toBeInTheDocument()

    // A present chip is a button that opens the linked page by id.
    await userEvent.click(canvas.getByRole('button'))
    await expect(args.onOpen).toHaveBeenCalledWith('page-42')
  },
}

export const Missing: Story = {
  args: { id: 'page-gone', title: undefined, missing: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Faded placeholder label, and inert — no button, no open.
    await expect(canvas.getByText('Missing page')).toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expect(args.onOpen).not.toHaveBeenCalled()
  },
}
