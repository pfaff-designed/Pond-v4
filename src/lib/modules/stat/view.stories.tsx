import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { StatView } from './view'
import type { StatBlock } from './schema'

/**
 * The `stat` module (#12) — a headline KPI figure promoted from the Bklit set
 * (`ChartStatFlow`, NumberFlow-animated). Read-only (AI-maintained). The play
 * tests read the figure through its aria-label (the stable plain string — the
 * same pattern as the metric stories) because NumberFlow visually splits digits;
 * the count-up animation itself is verified by eye in live checks.
 */
const meta = {
  title: 'Modules/Stat',
  component: StatView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof StatView>

export default meta
type Story = StoryObj<typeof meta>

const mrr: StatBlock = {
  id: 's1',
  type: 'stat',
  label: 'Monthly revenue',
  value: 12500,
  format: 'currency',
  delta: 0.12,
  caption: 'vs last month',
}

/** Currency + upward delta: label, formatted figure, ▲ trend, caption. */
export const Currency: Story = {
  args: { data: mrr },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Monthly revenue')).toBeInTheDocument()
    await expect(
      canvas.getByRole('status', { name: 'Monthly revenue: $12,500' })
    ).toBeInTheDocument()
    await expect(canvas.getByText('▲ 12%')).toBeInTheDocument()
    await expect(canvas.getByText('vs last month')).toBeInTheDocument()
  },
}

/** Negative delta renders the ▼ trend. */
export const DownwardDelta: Story = {
  args: {
    data: {
      id: 's2',
      type: 'stat',
      label: 'Churn',
      value: 0.031,
      format: 'percent',
      delta: -0.05,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Churn: 3.1%' })).toBeInTheDocument()
    await expect(canvas.getByText('▼ 5%')).toBeInTheDocument()
  },
}

/** Bare number with suffix, no delta/caption: just the figure and its label. */
export const PlainNumber: Story = {
  args: {
    data: { id: 's3', type: 'stat', label: 'Longest run', value: 18.6, suffix: ' mi' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Longest run: 18.6 mi' })).toBeInTheDocument()
    await expect(canvas.queryByText(/▲|▼/)).not.toBeInTheDocument()
  },
}
