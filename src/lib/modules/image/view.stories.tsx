import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ImageView } from './view'
import type { ImageBlock } from './schema'

/**
 * The `image` module (#61) — an uploaded image / file attachment embedded in a
 * page. Envless-safe by design: Supabase is only constructed inside the upload
 * handler, so these stories render without NEXT_PUBLIC_SUPABASE_* (#38). The
 * real upload round-trip is jest-pinned (image-module.test.tsx); the stories
 * cover the three render faces.
 */
const meta = {
  title: 'Modules/Image',
  component: ImageView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ImageView>

export default meta
type Story = StoryObj<typeof meta>

// Inline SVG data URL so the image renders without network.
const sampleUrl =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="%23a9b8a0"/><circle cx="240" cy="120" r="70" fill="%236b7d62"/></svg>'
  )

const photo: ImageBlock = {
  id: 'i1',
  type: 'image',
  url: sampleUrl,
  filename: 'workbench.png',
  mediaType: 'image/png',
  caption: 'The workbench, mid-build',
}

/** An image attachment renders inline with its caption as alt + figcaption. */
export const Image: Story = {
  args: { data: photo },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'The workbench, mid-build' })).toBeInTheDocument()
    await expect(canvas.getByText('The workbench, mid-build')).toBeInTheDocument()
  },
}

/** A document attachment renders as a link chip, not an <img>. */
export const Document: Story = {
  args: {
    data: {
      id: 'i2',
      type: 'image',
      url: 'https://example.com/files/spec.pdf',
      filename: 'spec.pdf',
      mediaType: 'application/pdf',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
    const link = canvas.getByRole('link', { name: /spec\.pdf/ })
    await expect(link).toHaveAttribute('href', 'https://example.com/files/spec.pdf')
  },
}

/** Empty + editable: the upload affordance (the palette's authoring state). */
export const EmptyEditable: Story = {
  args: { data: { id: 'i3', type: 'image', url: '' }, editable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Upload a file')).toBeInTheDocument()
    await expect(canvas.getByText(/up to 10MB/)).toBeInTheDocument()
  },
}

/** Empty + read-only: a calm placeholder, no upload affordance. */
export const EmptyReadOnly: Story = {
  args: { data: { id: 'i4', type: 'image', url: '' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No file uploaded yet.')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Upload a file')).not.toBeInTheDocument()
  },
}

/**
 * An AI-emitted block carries no `mediaType`, so image-ness is inferred from the
 * URL's extension. Losing that renders a photograph as a file link — a plausible,
 * silent downgrade of every image Pond composes.
 */
export const InferredFromUrl: Story = {
  args: { data: { id: 'i5', type: 'image', url: 'https://example.com/files/pic.jpg' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/files/pic.jpg'
    )
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
  },
}

/** The same URL with a document extension stays a link: the inference cuts both ways. */
export const InferredDocumentFromUrl: Story = {
  args: { data: { id: 'i6', type: 'image', url: 'https://example.com/files/notes.md' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /notes\.md/ })).toBeInTheDocument()
  },
}
