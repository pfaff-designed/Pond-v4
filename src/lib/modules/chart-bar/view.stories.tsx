import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ChartBarView } from './view'
import type { ChartBarBlock } from './schema'

/**
 * The `chart-bar` module (ticket-36) — a bar chart promoted from the Bklit set,
 * wrapped in Press module-card chrome. Read-only. Rendered at the ~65ch editor
 * column width. Play tests assert the deterministic chrome; the Bklit SVG is verified
 * by eye.
 */
const meta = {
  title: 'Modules/ChartBar',
  component: ChartBarView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '65ch', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartBarView>

export default meta
type Story = StoryObj<typeof meta>

const spend: ChartBarBlock = {
  id: 'cb1',
  type: 'chart-bar',
  title: 'Spend by category',
  caption: 'This month',
  xLabel: 'Category',
  yLabel: 'Amount ($)',
  points: [
    { x: 'Rent', values: { Amount: 1800 } },
    { x: 'Food', values: { Amount: 420 } },
    { x: 'Transit', values: { Amount: 140 } },
    { x: 'Fun', values: { Amount: 260 } },
  ],
}

/** Single series across categories: title, caption, and axis labels render. */
export const SingleSeries: Story = {
  args: { data: spend },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Spend by category')).toBeInTheDocument()
    await expect(canvas.getByText('This month')).toBeInTheDocument()
    await expect(canvas.getByText('↔ Category')).toBeInTheDocument()
    await expect(canvas.getByText('↕ Amount ($)')).toBeInTheDocument()
  },
}

const grouped: ChartBarBlock = {
  id: 'cb2',
  type: 'chart-bar',
  title: 'Budget vs actual',
  points: [
    { x: 'Rent', values: { Budget: 1800, Actual: 1800 } },
    { x: 'Food', values: { Budget: 400, Actual: 460 } },
    { x: 'Transit', values: { Budget: 150, Actual: 120 } },
  ],
}

/** Grouped bars: a legend swatch per series. */
export const Grouped: Story = {
  args: { data: grouped },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Budget vs actual')).toBeInTheDocument()
    await expect(canvas.getByText('Budget')).toBeInTheDocument()
    await expect(canvas.getByText('Actual')).toBeInTheDocument()
  },
}

/** Empty/degenerate: no points → calm "No data yet", never a broken axis. */
export const Empty: Story = {
  args: { data: { id: 'cb3', type: 'chart-bar', title: 'Nothing tracked', points: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nothing tracked')).toBeInTheDocument()
    await expect(canvas.getByText('No data yet')).toBeInTheDocument()
  },
}
