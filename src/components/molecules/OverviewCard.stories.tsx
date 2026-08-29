import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { OverviewCard } from './OverviewCard'

const meta = {
  title: 'Molecules/OverviewCard',
  component: OverviewCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-80 bg-press-paper p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Marathon Training',
    stat: '4',
    sub: '4 pages inside · updated 2d ago',
    accent: '#5f7355',
    onOpen: fn(),
  },
} satisfies Meta<typeof OverviewCard>

export default meta
type Story = StoryObj<typeof meta>

/** The whole card is one click target. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Marathon Training')).toBeInTheDocument()
    // ticket-41: hover lifts, press settles back — both token-timed. Assert the
    // press-down active state is wired (the hover/press frames are visual).
    await expect(canvas.getByRole('button')).toHaveClass('active:scale-[0.994]')
    await userEvent.click(canvas.getByRole('button'))
    await expect(args.onOpen).toHaveBeenCalled()
  },
}

export const EmptyChild: Story = {
  args: { title: 'Scratchpad', stat: '0', sub: '0 pages inside · updated today' },
}
