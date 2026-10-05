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
      <div className="relative h-screen bg-mn-surface">
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
    // glyph-button pattern — SavePickerModal / rail-row CRUD / BlockCanvas ×), so
    // the glyph's line box can't float off-center. Read off the COMPUTED box, not
    // the class list: a renamed utility keeps the class assertion green while the
    // glyph drifts (#252 shipped the right class at the wrong value).
    const dc = getComputedStyle(dismiss)
    await expect(dc.display).toBe('grid')
    await expect(dc.alignItems).toBe('center')
    await expect(dc.justifyItems).toBe('center')
    // leading-none: the line box is exactly the font size, so the glyph can't
    // push the square taller than its 20.
    await expect(dc.lineHeight).toBe(dc.fontSize)
    await expect(dismiss.getBoundingClientRect().width).toBe(20)
    await expect(dismiss.getBoundingClientRect().height).toBe(20)
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

/**
 * The accept RECEIPT (Fix-1/F12) — what `requestNotify` surfaces through
 * `NotifyBridge` after a diff is accepted: a message, no Undo (the change is kept,
 * not staged), and one labelled secondary action that takes you to the result.
 * The bridge's routing and the toast's auto-expiry are timer wiring and stay in
 * jest; the button existing and firing is this story.
 */
export const Receipt: Story = {
  args: {
    message: 'Added 2 blocks to Garage ✓',
    onUndo: undefined,
    onAction: fn(),
    actionLabel: 'Open',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Added 2 blocks to Garage ✓')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Open' }))
    await expect(args.onAction).toHaveBeenCalledTimes(1)
    await expect(args.onDismiss).not.toHaveBeenCalled()
  },
}
