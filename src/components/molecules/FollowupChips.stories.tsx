import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { FollowupChips } from './FollowupChips'

const meta = {
  title: 'Molecules/FollowupChips',
  component: FollowupChips,
  parameters: { layout: 'centered' },
  args: {
    chips: ['turn this into the plan', 'add a phase for glazing', 'grill me harder'],
    onPick: fn(),
  },
} satisfies Meta<typeof FollowupChips>

export default meta
type Story = StoryObj<typeof meta>

/** The quiet default row of follow-up chips under a reply. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'turn this into the plan' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'grill me harder' })).toBeInTheDocument()
  },
}

/** Clicking a chip raises onPick with that chip's exact text. */
export const PickSendsText: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'add a phase for glazing' }))
    await expect(args.onPick).toHaveBeenCalledWith('add a phase for glazing')
  },
}

/** With a leading kicker label ("Next"). */
export const WithLabel: Story = {
  args: { label: 'Next' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Next')).toBeInTheDocument()
  },
}

/** Disabled while a reply is streaming — clicks don't fire. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'grill me harder' }))
    await expect(args.onPick).not.toHaveBeenCalled()
  },
}

/** No chips → renders nothing. */
export const Empty: Story = {
  args: { chips: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('group')).not.toBeInTheDocument()
  },
}
