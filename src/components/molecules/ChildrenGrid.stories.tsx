import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ChildrenGrid } from './ChildrenGrid'
import type { OverviewCardModel } from '@/lib/pages/overview'

const CARDS: OverviewCardModel[] = [
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
      <div className="max-w-2xl bg-press-paper p-6">
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

/** The default "Everything within" section: a card per child, one click target each. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Everything within')).toBeInTheDocument()
    await userEvent.click(canvas.getByText('Workout Log'))
    await expect(args.onOpenCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'log' }))
  },
}

/** Label omitted — the caller (OverviewSurface) owns its own rising label. */
export const NoLabel: Story = {
  args: { label: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Everything within')).not.toBeInTheDocument()
    await expect(canvas.getByText('Workout Log')).toBeInTheDocument()
  },
}

/** No children — the section collapses to nothing, so a childless page shows no grid. */
export const Empty: Story = {
  args: { cards: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Everything within')).not.toBeInTheDocument()
  },
}
