import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SlashMenu } from './SlashMenu'

const items = [
  { id: 'text', name: 'Text', description: 'A prose block written in markdown.' },
  { id: 'todo', name: 'Todo', description: 'A checklist of items, each toggleable done/undone.' },
  { id: 'metric', name: 'Metric', description: 'A single labelled figure.' },
  { id: 'table', name: 'Table', description: 'A structured table of rows and columns.' },
]

const meta = {
  title: 'Molecules/SlashMenu',
  component: SlashMenu,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-xs bg-press-paper p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    items,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof SlashMenu>

export default meta
type Story = StoryObj<typeof meta>

/** Every item shows name + muted when-to-use line; clicking one selects it. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Text')).toBeInTheDocument()
    await expect(canvas.getByText('Table')).toBeInTheDocument()
    await expect(
      canvas.getByText('A checklist of items, each toggleable done/undone.')
    ).toBeInTheDocument()

    await userEvent.click(canvas.getByText('Todo'))
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo' }))
  },
}

/** Filter-as-you-type narrows the list; Enter selects the surviving match. */
export const FilterThenSelect: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Filter blocks')
    await userEvent.type(input, 'tab')
    await expect(canvas.getByText('Table')).toBeInTheDocument()
    await expect(canvas.queryByText('Metric')).not.toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'table' }))
  },
}

/** ↓↓ then Enter selects the third item; Escape closes the menu. */
export const KeyboardNav: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Filter blocks')
    input.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'metric' }))

    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}

/** A filter with no matches shows the quiet empty line instead of items. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Filter blocks')
    await userEvent.type(input, 'zzz')
    await expect(canvas.getByText('No blocks match')).toBeInTheDocument()
  },
}
