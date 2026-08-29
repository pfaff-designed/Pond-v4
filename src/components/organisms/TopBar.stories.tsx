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
  },
} satisfies Meta<typeof TopBarView>

export default meta
type Story = StoryObj<typeof meta>

/** The resting cluster: icon-only ＋ and ⌘K, glass on paper. ＋ raises onCreate
 *  (the container opens the New page dialog — ticket-26). */
export const Resting: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New page' }))
    await expect(args.onCreate).toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Command palette (⌘K)' }))
    await expect(args.onCommandK).toHaveBeenCalled()
  },
}
