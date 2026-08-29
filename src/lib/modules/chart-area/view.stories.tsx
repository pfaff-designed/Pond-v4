import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ChartAreaView } from './view'
import type { ChartAreaBlock } from './schema'

/**
 * The `chart-area` module (ticket-36) — an area chart promoted from the Bklit set,
 * wrapped in Press module-card chrome. Read-only. Rendered at the ~65ch editor
 * column width. Play tests assert the deterministic chrome; the Bklit SVG is verified
 * by eye.
 */
const meta = {
  title: 'Modules/ChartArea',
  component: ChartAreaView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '65ch', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartAreaView>

export default meta
type Story = StoryObj<typeof meta>

const balance: ChartAreaBlock = {
  id: 'ca1',
  type: 'chart-area',
  title: 'Account balance',
  caption: 'Rolling six months',
  xLabel: 'Month',
  yLabel: 'Balance ($)',
  points: [
    { x: '2026-01', values: { Balance: 1200 } },
    { x: '2026-02', values: { Balance: 1650 } },
    { x: '2026-03', values: { Balance: 1420 } },
    { x: '2026-04', values: { Balance: 2100 } },
  ],
}

/** Single filled series: title, caption, and axis labels render at editor width. */
export const SingleSeries: Story = {
  args: { data: balance },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Account balance')).toBeInTheDocument()
    await expect(canvas.getByText('Rolling six months')).toBeInTheDocument()
    await expect(canvas.getByText('↔ Month')).toBeInTheDocument()
    await expect(canvas.getByText('↕ Balance ($)')).toBeInTheDocument()
  },
}

/** Empty/degenerate: no points → calm "No data yet", never a broken axis. */
export const Empty: Story = {
  args: { data: { id: 'ca2', type: 'chart-area', title: 'No history yet', points: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No history yet')).toBeInTheDocument()
    await expect(canvas.getByText('No data yet')).toBeInTheDocument()
  },
}
