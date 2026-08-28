import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { Breadcrumb } from './Breadcrumb'

const meta = {
  title: 'Molecules/Breadcrumb',
  component: Breadcrumb,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-press-paper p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    crumbs: [
      { id: 'health', type: 'area', title: 'Health' },
      { id: 'routines', type: 'page', title: 'Workout Routines' },
    ],
    current: '3-Day Full-Body Routine',
    onNavigate: fn(),
  },
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

/** Full trail: Life › Health › Workout Routines › current. Ancestors navigate. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Life')).toBeInTheDocument()
    await expect(canvas.getByText('3-Day Full-Body Routine')).toBeInTheDocument()

    // Life navigates to the root (null)
    await userEvent.click(canvas.getByText('Life'))
    await expect(args.onNavigate).toHaveBeenCalledWith(null)

    // an ancestor crumb navigates with the whole crumb (id + type + title)
    await userEvent.click(canvas.getByText('Health'))
    await expect(args.onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'health', type: 'area' })
    )
  },
}

/** The current node is not a link — clicking it navigates nowhere at all. */
export const CurrentIsNotClickable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const current = canvas.getByText('3-Day Full-Body Routine')
    await userEvent.click(current)
    await expect(args.onNavigate).not.toHaveBeenCalled()
    await expect(current).toHaveAttribute('aria-current', 'page')
  },
}

/**
 * Editor variant: no `current` tail (the title input owns the tail), so the
 * breadcrumb shows only the ancestor path.
 */
export const AncestorPathOnly: Story = {
  args: { current: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Workout Routines')).toBeInTheDocument()
    await expect(canvas.queryByText('3-Day Full-Body Routine')).not.toBeInTheDocument()
  },
}

/** A root page: just "Life", still a home affordance. */
export const RootOnly: Story = {
  args: { crumbs: [], current: undefined },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Life'))
    await expect(args.onNavigate).toHaveBeenCalledWith(null)
  },
}
