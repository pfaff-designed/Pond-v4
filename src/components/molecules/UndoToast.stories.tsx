import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { UndoToast, UndoToastViewport } from './UndoToast'

const meta = {
  title: 'Molecules/UndoToast',
  component: UndoToast,
  parameters: { layout: 'fullscreen' },
  decorators: [
    // `relative` because the viewport is absolutely positioned within its
    // nearest positioned ancestor (the app's content row; here, this frame).
    (Story) => (
      <div className="relative h-screen bg-press-paper">
        <UndoToastViewport>
          <Story />
        </UndoToastViewport>
      </div>
    ),
  ],
  args: {
    message: 'Deleted "Scratchpad"',
    durationMs: 6000,
    onUndo: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof UndoToast>

export default meta
type Story = StoryObj<typeof meta>

/** Undo is the primary action — clicking it restores the deletion. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Deleted "Scratchpad"')).toBeInTheDocument()
    // ticket-41: the toast carries the token-driven entry class (the animation
    // itself is visual; we assert the class is wired, not the frames).
    await expect(canvas.getByRole('status')).toHaveClass('motion-toast')
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(args.onUndo).toHaveBeenCalled()
    await expect(args.onDismiss).not.toHaveBeenCalled()
  },
}

/** Dismissing commits the deletion (host flushes the deferred write). */
export const Dismiss: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const dismiss = canvas.getByRole('button', { name: 'Dismiss' })
    // #60: the ✕ sits in a fixed square with both-axis grid centering (the house
    // glyph-button pattern — SavePickerModal / TreeRow CRUD / BlockCanvas ×), so
    // the glyph's line box can't float off-center.
    await expect(dismiss).toHaveClass('grid', 'h-5', 'w-5', 'place-items-center', 'leading-none')
    await userEvent.click(dismiss)
    await expect(args.onDismiss).toHaveBeenCalled()
    await expect(args.onUndo).not.toHaveBeenCalled()
  },
}

/** A block deletion reads differently but works the same. */
export const BlockDeleted: Story = {
  args: { message: 'Deleted text block' },
}

/** Without onUndo the toast is a plain notice (e.g. a failed delete) — no Undo button. */
export const Notice: Story = {
  args: { message: 'Couldn’t delete "Scratchpad"', onUndo: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  },
}
