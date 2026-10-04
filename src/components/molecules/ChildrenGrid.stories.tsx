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

/**
 * A page's nested pages: a card per child, one click target each, no section label.
 *
 * The cards ARE `PondMolecule kind="record-card"` (#95, the OverviewCard
 * absorption) — one molecule per card, each wrapped in exactly one button host,
 * and clicking a card's title raises the WHOLE card model back to the caller.
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const buttons = canvas.getAllByRole('button')
    await expect(buttons).toHaveLength(2)

    // Every card is a record-card molecule, one per button host — no card drawn
    // by hand, none drawn twice.
    const molecules = [...canvasElement.querySelectorAll<HTMLElement>('[data-kind="record-card"]')]
    await expect(molecules).toHaveLength(CARDS.length)
    for (const [i, molecule] of molecules.entries()) {
      await expect(molecule.closest('button')).toBe(buttons[i])
      await expect(molecule).toHaveTextContent(CARDS[i].title)
    }

    // Still opens: the click raises the whole card model, not just its id.
    await userEvent.click(canvas.getByText('Workout Log'))
    await expect(args.onOpenCard).toHaveBeenCalledWith(CARDS[1])
  },
}

/** No children — the section collapses to nothing, so a childless page shows no grid. */
export const Empty: Story = {
  args: { cards: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('button')).toBeNull()
  },
}
