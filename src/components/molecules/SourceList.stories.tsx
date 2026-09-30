import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { SourceList } from './SourceList'

const meta = {
  title: 'Molecules/SourceList',
  component: SourceList,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-prose font-serif text-[0.95rem] leading-[1.6] text-mn-text-meta">
        <p>Beginner pottery wheels currently run roughly $400–$700 for a tabletop model.</p>
        <Story />
      </div>
    ),
  ],
  args: {
    sources: [
      {
        sourceId: 's1',
        url: 'https://www.example-pottery.com/best-beginner-wheels',
        title: 'The 7 Best Beginner Pottery Wheels (2026)',
      },
      {
        sourceId: 's2',
        url: 'https://shop.example.com/wheels/tabletop',
        title: 'Tabletop Pottery Wheels — Shop',
      },
      // No title → falls back to the host.
      { sourceId: 's3', url: 'https://www.claylink.org/guides/wheels' },
    ],
  },
} satisfies Meta<typeof SourceList>

export default meta
type Story = StoryObj<typeof meta>

/** Titles link out; a title-less source shows its host. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sources')).toBeInTheDocument()
    const titled = canvas.getByRole('link', {
      name: 'The 7 Best Beginner Pottery Wheels (2026)',
    })
    await expect(titled).toHaveAttribute(
      'href',
      'https://www.example-pottery.com/best-beginner-wheels'
    )
    await expect(titled).toHaveAttribute('target', '_blank')
    await expect(titled).toHaveAttribute('rel', 'noopener noreferrer')
    // Title-less source → host, www. stripped.
    await expect(canvas.getByRole('link', { name: 'claylink.org' })).toBeInTheDocument()
  },
}

/** A single source still renders the row. */
export const SingleSource: Story = {
  args: {
    sources: [{ sourceId: 's1', url: 'https://example.com/x', title: 'One Source' }],
  },
}

/** Duplicate URLs collapse to one row — the provider can cite a page repeatedly. */
export const Deduped: Story = {
  args: {
    sources: [
      { sourceId: 'a1', url: 'https://example.com/wheels', title: 'Wheels Guide' },
      { sourceId: 'a2', url: 'https://example.com/wheels', title: 'Wheels Guide (again)' },
      { sourceId: 'a3', url: 'https://other.example.com/kilns', title: 'Kilns' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link')).toHaveLength(2)
    await expect(canvas.getByRole('link', { name: 'Wheels Guide' })).toBeInTheDocument()
    await expect(
      canvas.queryByRole('link', { name: 'Wheels Guide (again)' })
    ).not.toBeInTheDocument()
  },
}

/** No sources → nothing rendered (guarded by the caller too). */
export const Empty: Story = {
  args: { sources: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Sources')).not.toBeInTheDocument()
  },
}
