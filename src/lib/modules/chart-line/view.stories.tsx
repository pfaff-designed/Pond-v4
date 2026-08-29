import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ChartLineView } from './view'
import type { ChartLineBlock } from './schema'

/**
 * The `chart-line` module (ticket-36) — a line chart promoted from the Bklit set,
 * wrapped in Press module-card chrome. Read-only (AI-maintained). Rendered at the
 * ~65ch editor column width so the story matches how it appears on a page. The play
 * tests assert the module CHROME (kicker title, caption, legend, axis labels, empty
 * state) — the deterministic surface; the Bklit SVG itself is verified by eye.
 */
const meta = {
  title: 'Modules/ChartLine',
  component: ChartLineView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '65ch', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartLineView>

export default meta
type Story = StoryObj<typeof meta>

const mileage: ChartLineBlock = {
  id: 'cl1',
  type: 'chart-line',
  title: 'Weekly mileage',
  caption: 'Across the training block',
  xLabel: 'Week',
  yLabel: 'Miles',
  points: [
    { x: '2026-01', values: { Miles: 32 } },
    { x: '2026-02', values: { Miles: 41 } },
    { x: '2026-03', values: { Miles: 38 } },
    { x: '2026-04', values: { Miles: 46 } },
  ],
}

/** Single series: title + caption + axis labels render; no crash at editor width. */
export const SingleSeries: Story = {
  args: { data: mileage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Weekly mileage')).toBeInTheDocument()
    await expect(canvas.getByText('Across the training block')).toBeInTheDocument()
    await expect(canvas.getByText('↔ Week')).toBeInTheDocument()
    await expect(canvas.getByText('↕ Miles')).toBeInTheDocument()
  },
}

const multi: ChartLineBlock = {
  id: 'cl2',
  type: 'chart-line',
  title: 'Focus vs distraction',
  points: [
    { x: '2026-01', values: { Focus: 20, Distraction: 8 } },
    { x: '2026-02', values: { Focus: 26, Distraction: 6 } },
    { x: '2026-03', values: { Focus: 31, Distraction: 5 } },
  ],
}

/** Multi-series: a legend swatch per series, from the union of point value keys. */
export const MultiSeries: Story = {
  args: { data: multi },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Focus vs distraction')).toBeInTheDocument()
    await expect(canvas.getByText('Focus')).toBeInTheDocument()
    await expect(canvas.getByText('Distraction')).toBeInTheDocument()
  },
}

/** Empty/degenerate: no points → a calm "No data yet", never a broken axis. */
export const Empty: Story = {
  args: { data: { id: 'cl3', type: 'chart-line', title: 'No runs logged', points: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No runs logged')).toBeInTheDocument()
    await expect(canvas.getByText('No data yet')).toBeInTheDocument()
  },
}
