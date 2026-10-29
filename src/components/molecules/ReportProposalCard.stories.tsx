import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'

import { ReportProposalCard } from './ReportProposalCard'

/**
 * KAN-572 — the `report — proposed` card a `file_report` call renders in the
 * composer. No board draws it; it is `PageProposalCard`'s sibling, rendered
 * over the composer's glass the same way.
 */
const meta = {
  title: 'Molecules/ReportProposalCard',
  component: ReportProposalCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="mn-glass w-[508px] rounded-mn-card p-3">
        <Story />
      </div>
    ),
  ],
  args: {
    summary: 'calendar opens on the wrong month',
    text: 'i opened the calendar in october and it showed june',
    status: 'proposed',
    onFile: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ReportProposalCard>

export default meta
type Story = StoryObj<typeof meta>

/** The drafted report: two editable rows, file it and cancel. */
export const Proposed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('report — proposed')).toBeInTheDocument()
    await expect(canvas.getByRole('textbox', { name: 'summary' })).toHaveValue(
      'calendar opens on the wrong month'
    )
    await expect(canvas.getByRole('button', { name: 'file it' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'cancel' })).toBeInTheDocument()
  },
}

/** Filed: the ticket's key as a link. */
export const Filed: Story = {
  args: {
    status: 'filed',
    filedKey: 'KAN-900',
    filedUrl: 'https://pfaff-team.atlassian.net/browse/KAN-900',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'KAN-900' })).toBeInTheDocument()
  },
}
