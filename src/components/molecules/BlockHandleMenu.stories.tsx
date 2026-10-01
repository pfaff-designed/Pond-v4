import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { BlockHandleMenu } from './BlockHandleMenu'

/**
 * The items the host hands the menu for a LIST block (#101, board 6j frame 2):
 * `turn into › table`, carrying the preview of what will come out, then the
 * block's own actions. The frame's other conversions (checklist, text) and block
 * actions (move into a new page, copy link) are separate features, tracked apart.
 */
const listItems = [
  {
    id: 'turn-into-table',
    group: 'turn into' as const,
    label: 'table',
    preview: '4 rows · 3 columns',
    icon: 'table' as const,
  },
  { id: 'delete', group: 'block' as const, label: 'delete block', icon: 'delete' as const },
]

const meta = {
  title: 'Molecules/BlockHandleMenu',
  component: BlockHandleMenu,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex min-h-[260px] justify-start bg-mn-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    items: listItems,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BlockHandleMenu>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A list block: the `turn into` group offers `table`, and the row says what will
 * come out before it happens ("4 rows · 3 columns"). Picking it selects by id.
 */
export const ListBlock: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('turn into')).toBeInTheDocument()
    await expect(canvas.getByText('block')).toBeInTheDocument()

    const table = canvas.getByRole('menuitem', { name: /table/i })
    await expect(table).toHaveTextContent('4 rows · 3 columns')
    // ticket-41: the menu grows from its anchor via the token-driven class.
    await expect(canvas.getByRole('menu')).toHaveClass('motion-menu')

    await userEvent.click(table)
    await expect(args.onSelect).toHaveBeenCalledWith('turn-into-table')
  },
}

/**
 * A block that is no list: no conversion is offered at all — the `turn into`
 * group disappears rather than showing a dead row — and the block's own actions
 * remain.
 */
export const NotAList: Story = {
  args: { items: [{ id: 'delete', group: 'block', label: 'delete block', icon: 'delete' }] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('turn into')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('menuitem', { name: /table/i })).not.toBeInTheDocument()

    const del = canvas.getByRole('menuitem', { name: /delete block/i })
    await userEvent.click(del)
    await expect(args.onSelect).toHaveBeenCalledWith('delete')
  },
}

/**
 * Keyboard: the panel takes focus on open so ↓ moves to the second row at once,
 * Enter picks the active one, and Escape closes without picking anything.
 */
export const KeyboardNav: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const menu = canvas.getByRole('menu')
    await expect(menu).toHaveFocus()

    // The first row is active on open; ↓ then ↑ returns to it, and Enter picks it.
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith('turn-into-table')

    // ↓ walks past the group label to `delete block`, which Enter then picks.
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith('delete')

    await expect(args.onClose).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}
