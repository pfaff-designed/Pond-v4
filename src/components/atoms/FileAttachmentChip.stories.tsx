import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { FileAttachmentChip } from './FileAttachmentChip'

/**
 * The composer's attachment chip (#61) — CsvAttachmentPill's generalized
 * sibling. Images carry a thumbnail; other files the paperclip glyph. The ×
 * (present only with `onRemove`) is the remove-before-send affordance.
 */
const meta = {
  title: 'Atoms/FileAttachmentChip',
  component: FileAttachmentChip,
  parameters: { layout: 'centered' },
  args: {
    filename: 'workbench.png',
    // A tiny inline SVG data URL so the thumbnail renders without network.
    url:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23889977"/></svg>'
      ),
    mediaType: 'image/png',
    onRemove: fn(),
  },
} satisfies Meta<typeof FileAttachmentChip>

export default meta
type Story = StoryObj<typeof meta>

/** Image attachment: thumbnail + name + removable ×. */
export const Image: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('workbench.png')).toBeInTheDocument()
    await userEvent.click(canvas.getByLabelText('Remove workbench.png'))
    await expect(args.onRemove).toHaveBeenCalled()
  },
}

/** Document attachment: paperclip glyph instead of a thumbnail. */
export const Document: Story = {
  args: { filename: 'spec.pdf', mediaType: 'application/pdf' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('spec.pdf')).toBeInTheDocument()
  },
}

/** Sent (inert) chip — no onRemove, no ×. */
export const Sent: Story = {
  args: { filename: 'spec.pdf', mediaType: 'application/pdf', onRemove: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText(/remove/i)).not.toBeInTheDocument()
  },
}
