import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ReportProblemBox } from './ReportProblemBox'

/**
 * `report a problem`'s box (KAN-335) — no board draws it; built from the
 * component library per the ticket. A relative, sized harness stands in for
 * the shell so the box's own `PLACEMENT` (top 20, centred) has somewhere to sit.
 */
const meta = {
  title: 'Organisms/report a problem box',
  component: ReportProblemBox,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-mn-surface relative h-[200px] w-full">
        <Story />
      </div>
    ),
  ],
  args: {
    pageTitle: 'kitchen renovation',
    status: 'idle',
    onSubmit: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ReportProblemBox>

export default meta
type Story = StoryObj<typeof meta>

/** At rest: the line, the page chip, send disabled while empty. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', { name: 'what went wrong?' })).toBeInTheDocument()
    await expect(canvas.getByText('kitchen renovation')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'send' })).toBeDisabled()
  },
}

/** Typing enables send, and Enter submits once. */
export const Typing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'what went wrong?' }),
      'the chip reads the wrong page{Enter}'
    )
    await expect(args.onSubmit).toHaveBeenCalledWith('the chip reads the wrong page')
  },
}

/** Sending: the line and send are inert until the caller flips `status` back. */
export const Sending: Story = {
  args: { status: 'sending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', { name: 'what went wrong?' })).toBeDisabled()
  },
}

/** Filed: the key links to the issue. */
export const Filed: Story = {
  args: {
    status: 'filed',
    filedKey: 'KAN-123',
    filedUrl: 'https://pfaff-team.atlassian.net/browse/KAN-123',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/filed as/)).toHaveTextContent('filed as KAN-123 · thanks')
    await expect(canvas.getByRole('link', { name: 'KAN-123' })).toHaveAttribute(
      'href',
      'https://pfaff-team.atlassian.net/browse/KAN-123'
    )
  },
}

/** Error: the server's own words, verbatim. */
export const Error: Story = {
  args: { status: 'error', errorText: "can't file reports right now" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent("can't file reports right now")
  },
}

/** No page open yet — the chip drops rather than showing an empty pill. */
export const NoPageChip: Story = {
  args: { pageTitle: '' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('kitchen renovation')).not.toBeInTheDocument()
  },
}
