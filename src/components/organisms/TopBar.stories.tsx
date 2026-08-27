import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { TopBarView } from './TopBar'

const meta = {
  title: 'Organisms/TopBar',
  component: TopBarView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-40 bg-press-paper">
        <Story />
      </div>
    ),
  ],
  args: {
    onCreate: fn(),
    onCommandK: fn(),
    busy: false,
  },
} satisfies Meta<typeof TopBarView>

export default meta
type Story = StoryObj<typeof meta>

/** The resting cluster: icon-only ＋ and ⌘K, glass on paper. */
export const Resting: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New page' }))
    await expect(args.onCreate).toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Talk to Pond (⌘K)' }))
    await expect(args.onCommandK).toHaveBeenCalled()
  },
}

/** While a create is in flight the ＋ is disabled. */
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'New page' })).toBeDisabled()
  },
}
