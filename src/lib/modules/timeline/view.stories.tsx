import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

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

/** Empty/degenerate: no items → a calm "No data yet", never a broken axis. */
export const Empty: Story = {
  args: { data: { id: 'tl2', type: 'timeline', title: 'Launch plan', items: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Launch plan')).toBeInTheDocument()
    await expect(canvas.getByText('No data yet')).toBeInTheDocument()
  },
}
