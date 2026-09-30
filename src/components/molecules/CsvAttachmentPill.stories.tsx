import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CsvAttachmentPill } from './CsvAttachmentPill'

const meta = {
  title: 'Molecules/CsvAttachmentPill',
  component: CsvAttachmentPill,
  parameters: { layout: 'centered' },
  args: {
    filename: 'budget_2026.csv',
    rowCount: 48,
    onRemove: fn(),
  },
} satisfies Meta<typeof CsvAttachmentPill>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('budget_2026.csv')).toBeInTheDocument()
    await expect(canvas.getByText(/48 rows/)).toBeInTheDocument()

    await userEvent.click(canvas.getByLabelText('Remove budget_2026.csv'))
    await expect(args.onRemove).toHaveBeenCalled()
  },
}

export const SingleRow: Story = {
  args: { filename: 'single.csv', rowCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/1 row/)).toBeInTheDocument()
  },
}
