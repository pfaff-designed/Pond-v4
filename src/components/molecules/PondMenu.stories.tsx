import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'

import { PondMenu, type PondMenuGroup } from './PondMenu'

/** The DC's own fixture for kind `block`: `turnInto="table:3 rows · 2 columns;list;text"`. */
const blockGroups: PondMenuGroup[] = [
  {
    id: 'turn-into',
    label: 'turn into',
    heading: true,
    items: [
      { id: 'turn-into:table', label: 'table', value: '3 rows · 2 columns' },
      { id: 'turn-into:list', label: 'list' },
      { id: 'turn-into:text', label: 'text' },
    ],
  },
  {
    id: 'block',
    label: 'block',
    items: [
      { id: 'copy-link', label: 'copy link to block' },
      { id: 'delete', label: 'delete' },
    ],
  },
]

const meta = {
  title: 'Molecules/PondMenu',
  component: PondMenu,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="flex min-h-[320px] justify-start bg-mn-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    kind: 'block',
    label: 'block menu',
    groups: blockGroups,
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PondMenu>

export default meta
type Story = StoryObj<typeof meta>

/** Kind `block` on paper, 260 wide. */
export const Block: Story = {}

/** Kind `block` on the dark ground: the ink glass. */
export const BlockInk: Story = {
  decorators: [
    (Story) => (
      <div className="dark flex min-h-[320px] justify-start bg-raw-ink p-6">
        <Story />
      </div>
    ),
  ],
}

/** Kind `block` on a phone: 350 wide, 44px items at 15px. */
export const BlockPhone: Story = {
  args: { size: 'mobile' },
}
