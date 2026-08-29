import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CommandPalette, type PaletteItem } from './CommandPalette'

const items: PaletteItem[] = [
  { id: 'act-new', label: 'New page', subtitle: 'Create a page', group: 'action' },
  { id: 'act-ask', label: 'Ask Pond', subtitle: 'Focus the composer', group: 'action' },
  { id: 'rec-health', label: 'Health', subtitle: 'Personal · Health', group: 'recent' },
  { id: 'rec-budget', label: 'Budget', subtitle: 'Finances · Budget', group: 'recent' },
  { id: 'pg-woodworking', label: 'Woodworking', subtitle: 'Creativity', group: 'page' },
  { id: 'pg-travel', label: 'Travel', subtitle: 'Personal', group: 'page' },
  { id: 'pg-recipes', label: 'Recipes', subtitle: 'Personal · Food', group: 'page' },
]

const meta = {
  title: 'Molecules/CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'fullscreen' },
  args: {
    items,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CommandPalette>

export default meta
type Story = StoryObj<typeof meta>

/** All items grouped: Quick actions, Recent, Pages. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Quick actions')).toBeInTheDocument()
    await expect(canvas.getByText('Recent')).toBeInTheDocument()
    await expect(canvas.getByText('Pages')).toBeInTheDocument()
    await expect(canvas.getByText('New page')).toBeInTheDocument()
    await expect(canvas.getByText('Woodworking')).toBeInTheDocument()

    await userEvent.click(canvas.getByText('Ask Pond'))
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'act-ask' }))
  },
}

/** Filter-as-you-type narrows list to matching labels. */
export const FilterThenSelect: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Search pages or actions')
    await userEvent.type(input, 'wood')
    await expect(canvas.getByText('Woodworking')).toBeInTheDocument()
    await expect(canvas.queryByText('Budget')).not.toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pg-woodworking' })
    )
  },
}

/** ↑↓ keyboard navigation selects correct item. */
export const KeyboardNav: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Search pages or actions')
    input.focus()
    // First item is New page (action group), ↓ moves to Ask Pond, ↓ to Health (recent), ↵ selects.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-health' }))
  },
}

/** Empty filter query → "No results" message. */
export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Search pages or actions')
    await userEvent.type(input, 'zzzzz')
    await expect(canvas.getByText('No results')).toBeInTheDocument()
  },
}

/** Clicking close button calls onClose. */
export const CloseButton: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Close palette'))
    await expect(args.onClose).toHaveBeenCalled()
  },
}
