import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { PageView } from './view'
import { samplePage as page } from './sample'

/**
 * The `page` container rendering a mixed block list — text, todo, table and an image —
 * entirely through the registry (recursive composition, t12 §6). No block type is
 * hard-coded in the container.
 */
const meta = {
  title: 'Modules/Page',
  component: PageView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageView>

export default meta
type Story = StoryObj<typeof meta>

/** Read-only: every child renders; interactions are inert. */
export const ReadOnly: Story = {
  args: { data: page },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Marathon Training')).toBeInTheDocument()
    await expect(
      canvas.getByText('Base build week — hold easy pace on the long run.')
    ).toBeInTheDocument()
    await expect(canvas.getByText('Long run')).toBeInTheDocument()
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('The long-run route')).toBeInTheDocument()
  },
}

/** Editable: todo checkboxes and text fields become interactive. */
export const Editable: Story = {
  args: { data: page, editable: true },
}
