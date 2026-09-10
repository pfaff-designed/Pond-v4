import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'

import { TimelineView } from './view'
import type { TimelineBlock } from './schema'

/**
 * The `timeline` module (#11) — a standalone read-only Gantt with AI-authored
 * inline items, wrapped in the shared module-card chrome. Distinct from the #27
 * collection gantt view mode (which drags/reschedules child pages): nothing here
 * is interactive. Rendered at the ~65ch editor column width so the story matches
 * how it appears on a page. The play tests assert the chrome, the read-only bar
 * aria-labels, the milestone tick, and the calm empty state; the exact layout
 * math is jest-pinned in timeline-data.test.ts and apply.test.ts.
 */
const meta = {
  title: 'Modules/Timeline',
  component: TimelineView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '65ch', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimelineView>

export default meta
type Story = StoryObj<typeof meta>

const renovation: TimelineBlock = {
  id: 'tl1',
  type: 'timeline',
  title: 'Renovation',
  caption: 'Fall push',
  items: [
    { label: 'Demo', start: '2026-09-01', end: '2026-09-05' },
    { label: 'Framing', start: '2026-09-08', end: '2026-09-24' },
    { label: 'Electrical', start: '2026-09-15', end: '2026-09-26' },
    { label: 'Inspection', start: '2026-09-30' }, // single-day milestone
  ],
}

/** Phases + a milestone: chrome, bars with span aria-labels, weekly axis. */
export const Phases: Story = {
  args: { data: renovation },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Renovation')).toBeInTheDocument()
    await expect(canvas.getByText('Fall push')).toBeInTheDocument()
    await expect(
      canvas.getByRole('img', { name: 'Demo: 2026-09-01 – 2026-09-05' })
    ).toBeInTheDocument()
    // The milestone collapses to its single day — no " – end" half.
    await expect(canvas.getByRole('img', { name: 'Inspection: 2026-09-30' })).toBeInTheDocument()
    // Read-only: no drag bodies, no resize edge handles.
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

/**
 * #57 regression: a YEAR of phases in a narrow card. The weekly baseline would
 * be 52 axis labels on top of each other and a clipped right edge; the fix
 * measures the track and thins the ticks, and the surface stays fully fluid
 * (no horizontal scroll, nothing cut off).
 */
export const CrowdedYearNarrow: Story = {
  args: {
    data: {
      id: 'tl3',
      type: 'timeline',
      title: 'Year plan',
      caption: 'Four quarters',
      items: [
        { label: 'Q1 research', start: '2026-01-05', end: '2026-03-29' },
        { label: 'Q2 build', start: '2026-03-30', end: '2026-06-28' },
        { label: 'Q3 beta', start: '2026-06-29', end: '2026-09-27' },
        { label: 'Q4 launch', start: '2026-09-28', end: '2027-01-03' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    // The ResizeObserver measurement thins the axis — far fewer than 52 labels.
    await waitFor(() => {
      const labels = canvasElement.querySelectorAll('span.tabular-nums')
      expect(labels.length).toBeGreaterThanOrEqual(2)
      expect(labels.length).toBeLessThan(10)
    })
    // No two neighbouring date labels overlap.
    const rects = Array.from(canvasElement.querySelectorAll<HTMLElement>('span.tabular-nums'))
      .map((el) => el.getBoundingClientRect())
      .sort((a, b) => a.left - b.left)
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].left).toBeGreaterThanOrEqual(rects[i - 1].right)
    }
    // And the chart fits its container — nothing to scroll, nothing cut off.
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth)
  },
}

/** Empty/degenerate: no items → a calm "No data yet", never a broken axis. */
export const Empty: Story = {
  args: { data: { id: 'tl2', type: 'timeline', title: 'Launch plan', items: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Launch plan')).toBeInTheDocument()
    await expect(canvas.getByText('No data yet')).toBeInTheDocument()
  },
}
