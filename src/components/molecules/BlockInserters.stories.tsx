import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import { AddBlockButton, InsertBetween } from './BlockInserters'

/**
 * The two shared block-insertion affordances (ticket-37, ticket-44).
 * `InsertBetween` opens the registry-derived palette; `AddBlockButton` (UI-audit
 * Slice 2a) drops a text block directly — typing `/` in it summons that same palette.
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
    await expect(screen.queryByLabelText('Filter blocks')).not.toBeInTheDocument()
    // Click drops a text block (onAdd) — and does NOT open the palette on this button.
    await userEvent.click(add)
    await expect(args.onAdd).toHaveBeenCalled()
    await expect(screen.queryByLabelText('Filter blocks')).not.toBeInTheDocument()
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
