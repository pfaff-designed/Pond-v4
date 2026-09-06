import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'

import { HeatmapView } from './view'
import type { HeatmapBlock } from './schema'

/**
 * The `heatmap` module (#12) — a calendar activity heatmap promoted from the
 * Bklit set, wrapped in the shared module-card chrome. Read-only (AI-maintained).
 * Rendered at the ~65ch editor column width so the story matches how it appears
 * on a page. The play tests assert the CHROME (kicker title, caption, empty
 * state) plus the grid's deterministic surface — cells exist and the weekday
 * axis renders; the exact binning is jest-pinned in heatmap-data.test.ts and the
 * visual is verified by eye.
 */
const meta = {
  title: 'Modules/Heatmap',
  component: HeatmapView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '65ch', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeatmapView>

export default meta
type Story = StoryObj<typeof meta>

const workouts: HeatmapBlock = {
  id: 'hm1',
  type: 'heatmap',
  title: 'Workouts',
  caption: 'Sessions per day, past six weeks',
  cells: [
    { date: '2026-01-05', value: 1 },
    { date: '2026-01-07', value: 2 },
    { date: '2026-01-10', value: 1 },
    { date: '2026-01-13', value: 3 },
    { date: '2026-01-16', value: 1 },
    { date: '2026-01-21', value: 2 },
    { date: '2026-01-27', value: 4 },
    { date: '2026-02-03', value: 2 },
    { date: '2026-02-06', value: 1 },
    { date: '2026-02-11', value: 3 },
  ],
}

/** Cells across six weeks: chrome renders and the SVG grid materializes. */
export const Activity: Story = {
  args: { data: workouts },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Workouts')).toBeInTheDocument()
    await expect(canvas.getByText('Sessions per day, past six weeks')).toBeInTheDocument()
    // The Bklit grid: at least one full week of day-cell rects (ParentSize
    // measures async, so wait for the SVG to materialize).
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(7)
    })
    // Month labels (portal-mounted) — the span covers Jan and Feb.
    await expect(await canvas.findByText('Jan')).toBeInTheDocument()
    await expect(await canvas.findByText('Feb')).toBeInTheDocument()
  },
}

/** Empty/degenerate: no cells → a calm "No data yet", never a broken grid. */
export const Empty: Story = {
  args: { data: { id: 'hm2', type: 'heatmap', title: 'No sessions logged', cells: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No sessions logged')).toBeInTheDocument()
    await expect(canvas.getByText('No data yet')).toBeInTheDocument()
  },
}
