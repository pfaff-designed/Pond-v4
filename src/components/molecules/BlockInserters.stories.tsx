import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import { AddBlockButton, InsertBetween } from './BlockInserters'

/**
 * The two shared block-insertion affordances (ticket-37, ticket-44). Both open
 * the SAME registry-derived palette; the pick is handed to the caller.
 */
const meta = {
  title: 'Molecules/BlockInserters',
  component: AddBlockButton,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-md bg-press-paper p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddBlockButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The always-visible foot affordance (ticket-44 §3). It's present at rest (not
 * hover-only) and PALETTE-FIRST: clicking opens the block picker, and only a
 * pick reaches onAdd — never a bare text block.
 */
export const AlwaysVisibleAdd: Story = {
  args: { onAdd: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // At rest: the button is visible with no palette open. The palette (SlashMenu)
    // portals to document.body, so its contents are queried via `screen`, not the
    // story canvas.
    const add = canvas.getByRole('button', { name: 'Add a block' })
    await expect(add).toBeInTheDocument()
    await expect(screen.queryByLabelText('Filter blocks')).not.toBeInTheDocument()
    // Click opens the palette; onAdd not yet called.
    await userEvent.click(add)
    await expect(await screen.findByLabelText('Filter blocks')).toBeInTheDocument()
    await expect(args.onAdd).not.toHaveBeenCalled()
    // Picking a module hands that item back.
    await userEvent.click(await screen.findByText('Table'))
    await expect(args.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'table' }))
  },
}

/**
 * The mid-page hover `+` (ticket-37): a quiet hairline whose `+` opens the same
 * palette and inserts THERE. The `+` is a real button (reachable without hover in
 * the play test).
 */
export const InsertBetweenBlocks: StoryObj<typeof InsertBetween> = {
  render: (args) => <InsertBetween {...args} />,
  args: { onInsert: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const insert = canvas.getByRole('button', { name: 'Insert block' })
    await userEvent.click(insert)
    // The palette portals to document.body, so query it via `screen`.
    await userEvent.click(await screen.findByText('Todo'))
    await expect(args.onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo' }))
  },
}
