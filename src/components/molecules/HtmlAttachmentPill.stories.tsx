import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { HtmlAttachmentPill } from './HtmlAttachmentPill'

const narrow: Decorator = (Story) => (
  <div style={{ width: 160 }}>
    <Story />
  </div>
)

const meta = {
  title: 'Molecules/HtmlAttachmentPill',
  component: HtmlAttachmentPill,
  parameters: { layout: 'centered' },
  args: {
    filename: 'running-log.html',
    onRemove: fn(),
  },
} satisfies Meta<typeof HtmlAttachmentPill>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('running-log.html')).toBeInTheDocument()

    await userEvent.click(canvas.getByLabelText('Remove running-log.html'))
    await expect(args.onRemove).toHaveBeenCalled()
  },
}

/**
 * The 44px remove hit target (frame 7 / AUDIT X1) comes from a ::before
 * pseudo-element, not the button's own box — the pill stays its desktop
 * height at max-md (board 6z frame 7 has no mobile variant).
 */
export const Mobile: Story = {
  name: 'remove · mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const remove = canvas.getByLabelText('Remove running-log.html')
    const pill = remove.parentElement!
    await expect(Math.round(remove.getBoundingClientRect().height)).toBeLessThan(20)
    await expect(Math.round(pill.getBoundingClientRect().height)).toBeLessThan(30)
  },
}

/**
 * The outer pill can't carry 'truncate' (it would clip the remove button's
 * off-box hit area), so the filename span must still ellipsize on its own.
 */
export const LongFilename: Story = {
  name: 'filename · long',
  decorators: [narrow],
  args: {
    filename: 'quarterly-engineering-retrospective-notes-and-action-items.html',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const label = canvas.getByText(args.filename)
    await expect(label).toHaveClass('truncate')
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
  },
}
