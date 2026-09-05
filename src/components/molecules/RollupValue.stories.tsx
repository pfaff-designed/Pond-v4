import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { RollupValue } from './RollupValue'

/**
 * The presentational rollup value (#20): formats a `RollupResult` and nothing else
 * (a connected wrapper does the fetch + compute). Integer for count, ≤2dp for a
 * fractional average, ISO date for min/max over dates, and a faded "—" for empty.
 */
const meta = {
  title: 'Molecules/RollupValue',
  component: RollupValue,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RollupValue>

export default meta
type Story = StoryObj<typeof meta>

/** A count (or any whole sum) prints as a plain integer. */
export const Count: Story = {
  args: { result: { kind: 'number', value: 12 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('12')).toBeInTheDocument()
  },
}

/** A fractional average trims to ≤2 decimals. */
export const Average: Story = {
  args: { result: { kind: 'number', value: 3.66666 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('3.67')).toBeInTheDocument()
  },
}

/** A min/max over dates renders the extreme row's ISO date. */
export const DateExtreme: Story = {
  args: { result: { kind: 'date', value: '2026-09-05' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('2026-09-05')).toBeInTheDocument()
  },
}

/** Empty (unresolvable target, wrong type, or no data) renders a faded dash. */
export const Empty: Story = {
  args: { result: { kind: 'empty' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeInTheDocument()
  },
}

/** While the underlying rows load, a quiet placeholder holds the slot. */
export const Loading: Story = {
  args: { result: { kind: 'empty' }, loading: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Loading rollup')).toBeInTheDocument()
  },
}
