import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ToggleView } from './view'
import type { ToggleBlock } from './schema'

/**
 * The `toggle` block (KAN-480 slice 1) — a summary line with a hand-drawn ▸
 * that folds or unfolds one body of text under it. No board draws a toggle
 * (app-over-board, SPEC's own "Decisions"), so these stories pin the ▸'s own
 * two states rather than a board literal: `aria-expanded` and the `Caret`
 * atom's `rotate-90` class, open at rest / folded, per `Caret.tsx`'s own
 * contract (right at rest, rotated open — the opposite of a disclosure
 * triangle that rotates to CLOSE).
 */
const meta = {
  title: 'Modules/Toggle',
  component: ToggleView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ToggleView>

export default meta
type Story = StoryObj<typeof meta>

const caretOf = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('button').querySelector('svg')!

/** A two-line body, unfolded — the path's own `passport` step, with a second line. */
const twoLineBody: ToggleBlock = {
  id: 't1',
  type: 'toggle',
  content: 'packing list',
  body: 'passport\n\ntickets',
}

export const Open: Story = {
  args: { data: twoLineBody },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    await expect(caretOf(canvasElement)).toHaveClass('rotate-90')
    await expect(canvas.getByText('packing list')).toBeInTheDocument()
    await expect(canvas.getByText('passport')).toBeInTheDocument()
    await expect(canvas.getByText('tickets')).toBeInTheDocument()
  },
}

export const Folded: Story = {
  args: { data: { ...twoLineBody, folded: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    await expect(caretOf(canvasElement)).not.toHaveClass('rotate-90')
    await expect(canvas.getByText('packing list')).toBeInTheDocument()
    await expect(canvas.queryByText('passport')).not.toBeInTheDocument()
    await expect(canvas.queryByText('tickets')).not.toBeInTheDocument()
  },
}

/** `mintPreset('toggle')`'s own shape — just landed off `/toggle`, nothing typed yet. */
export const Empty: Story = {
  args: { data: { id: 't1', type: 'toggle', content: '' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Absent `folded` reads as unfolded, same as every other story's default state.
    await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    await expect(caretOf(canvasElement)).toHaveClass('rotate-90')
  },
}
