import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ChildrenGrid } from './ChildrenGrid'
import type { ChildCardModel } from '@/lib/pages/child-cards'

const CARDS: ChildCardModel[] = [
  {
    id: 'routine',
    type: 'page',
    title: '3-Day Full-Body Dumbbell Routine',
    stat: '0',
    sub: '0 pages inside · updated today',
    accent: '#5f7355',
  },
  {
    id: 'log',
    type: 'page',
    title: 'Workout Log',
    stat: '2',
    sub: '2 pages inside · updated 3d ago',
    accent: '#5f7355',
  },
]

const meta = {
  title: 'Molecules/ChildrenGrid',
  component: ChildrenGrid,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-mn-surface p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    cards: CARDS,
    onOpenCard: fn(),
  },
} satisfies Meta<typeof ChildrenGrid>

export default meta
type Story = StoryObj<typeof meta>

/** A page's nested pages: a card per child, one click target each, no section label. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
    await userEvent.click(canvas.getByText('Workout Log'))
    await expect(args.onOpenCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'log' }))
  },
}

/** No children — the section collapses to nothing, so a childless page shows no grid. */
export const Empty: Story = {
  args: { cards: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('button')).toBeNull()
  },
}
