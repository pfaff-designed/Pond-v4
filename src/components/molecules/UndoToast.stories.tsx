import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { UndoToast, UndoToastViewport } from './UndoToast'

const meta = {
  title: 'Molecules/UndoToast',
  component: UndoToast,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-press-paper">
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
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    await expect(args.onUndo).toHaveBeenCalled()
    await expect(args.onDismiss).not.toHaveBeenCalled()
  },
}

/** Dismissing commits the deletion (host flushes the deferred write). */
export const Dismiss: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
    await expect(args.onDismiss).toHaveBeenCalled()
    await expect(args.onUndo).not.toHaveBeenCalled()
  },
}

/** A block deletion reads differently but works the same. */
export const BlockDeleted: Story = {
  args: { message: 'Deleted text block' },
}
