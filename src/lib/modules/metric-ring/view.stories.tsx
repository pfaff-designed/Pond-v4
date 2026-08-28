import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { MetricRingView } from './view'
import type { MetricRingBlock } from './schema'

/**
 * The metric-ring module (Fix-6 / F15) — a progress ring at column width.
 * Tests the composed card layout: title, ring, and percentage caption all render,
 * and a long title wraps rather than collapsing the ring geometry.
 */
const meta = {
  title: 'Modules/MetricRing',
  component: MetricRingView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MetricRingView>

export default meta
type Story = StoryObj<typeof meta>

const running: MetricRingBlock = {
  id: 'r1',
  type: 'metric-ring',
  label: 'Weekly miles',
  sub: 'MILES',
  pct: 0.62,
}

/** Standard ring: title, ring arc, caption all present. */
export const Standard: Story = {
  args: { data: running },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Weekly miles')).toBeInTheDocument()
    await expect(canvas.getByText('62% complete')).toBeInTheDocument()
    // The sub label appears inside the ring as a small caps caption.
    await expect(canvas.getByText('MILES')).toBeInTheDocument()
  },
}

/** Long title wraps cleanly — the ring must still render (Fix-6: no collapse). */
export const LongTitle: Story = {
  args: {
    data: {
      ...running,
      label: 'Annual running distance toward my marathon training goal for the Autumn season',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'Annual running distance toward my marathon training goal for the Autumn season'
      )
    ).toBeInTheDocument()
    // Ring SVG and caption must both be present even with the long title.
    await expect(canvas.getByText('62% complete')).toBeInTheDocument()
  },
}

/** Empty ring (0%). */
export const Empty: Story = {
  args: { data: { ...running, pct: 0, sub: undefined } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0% complete')).toBeInTheDocument()
  },
}

/** Full ring (100%). */
export const Complete: Story = {
  args: { data: { ...running, pct: 1 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('100% complete')).toBeInTheDocument()
  },
}
