import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { StageText } from './StageText'

/**
 * The whispered stage line under a long generation (ticket-32). Verifies the copy
 * is announced politely and typeset in the correspondence serif, not a mono console.
 */
const meta = {
  title: 'Atoms/StageText',
  component: StageText,
  parameters: { layout: 'padded' },
  args: { label: 'drafting your page…' },
} satisfies Meta<typeof StageText>

export default meta
type Story = StoryObj<typeof meta>

/** The default drafting stage. */
export const Drafting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('drafting your page…')).toBeInTheDocument()
    // Announced as a live status region for assistive tech.
    await expect(canvas.getByRole('status')).toBeInTheDocument()
  },
}

/** Reading a named page — the richest stage copy. */
export const ReadingNamedPage: Story = {
  args: { label: 'reading Ceramics Studio Plan…' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('reading Ceramics Studio Plan…')).toBeInTheDocument()
  },
}

/** Searching the web. */
export const SearchingWeb: Story = {
  args: { label: 'searching the web…' },
}
