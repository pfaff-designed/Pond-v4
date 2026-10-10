import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import { AddBlockButton } from './BlockInserters'

/**
 * The foot add (ticket-44, UI-audit Slice 2a): drops a text block directly —
 * typing `/` in it summons the block palette.
 */
const meta = {
  title: 'Molecules/BlockInserters',
  component: AddBlockButton,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-md bg-mn-surface p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddBlockButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The always-visible foot affordance (ticket-44 §3). It's present at rest (not
 * hover-only) and TEXT-DEFAULT (UI-audit Slice 2a): clicking calls onAdd, which
 * drops an empty text block ready to type. The button itself never opens the
 * palette — the user types `/` in the new block to swap to any other block type.
 */
export const AlwaysVisibleAdd: Story = {
  args: { onAdd: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // At rest: the button is visible with no palette open.
    const add = canvas.getByRole('button', { name: 'Add a block' })
    await expect(add).toBeInTheDocument()
    await expect(screen.queryByRole('listbox', { name: 'blocks' })).not.toBeInTheDocument()
    // Click drops a text block (onAdd) — and does NOT open the menu on this button.
    await userEvent.click(add)
    await expect(args.onAdd).toHaveBeenCalled()
    await expect(screen.queryByRole('listbox', { name: 'blocks' })).not.toBeInTheDocument()
  },
}
