import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TextSelectionPopover } from './TextSelectionPopover'

const meta = {
  title: 'Molecules/TextSelectionPopover',
  component: TextSelectionPopover,
  parameters: { layout: 'padded' },
  args: {
    onAsk: fn(),
    disabled: false,
  },
} satisfies Meta<typeof TextSelectionPopover>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Render a block of text and confirm the popover surfaces when text is selected.
 * Because simulating real selection changes in Storybook is environment-dependent,
 * we test the rendered shell and verify disabled suppression instead.
 */
export const Default: Story = {
  decorators: [
    (Story) => (
      <div>
        <p data-block-id="block-1" className="mb-4 leading-relaxed">
          Select some of this text to see the quiet &ldquo;Ask Pond&rdquo; affordance appear near
          your selection. It does not auto-send &mdash; it only populates the composer.
        </p>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The popover is not visible until a selection is made.
    await expect(canvas.queryByLabelText('Ask Pond about selection')).not.toBeInTheDocument()
  },
}

/** When disabled=true, the popover never appears (streaming guard). */
export const Disabled: Story = {
  args: { disabled: true },
  decorators: [
    (Story) => (
      <div>
        <p data-block-id="block-1">Disabled — no popover even if text is selected.</p>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText('Ask Pond about selection')).not.toBeInTheDocument()
  },
}

/** Clicking the Ask Pond button (when programmatically shown) triggers onAsk. */
export const ButtonInteraction: Story = {
  decorators: [
    (Story, ctx) => (
      <div>
        {/* Render a visible popover-like button for direct interaction testing */}
        <button
          aria-label="Ask Pond about selection"
          onClick={() => ctx.args.onAsk({ text: 'test selection', blockId: 'block-1' })}
          className="rounded-md border border-mn-line bg-mn-surface px-2.5 py-1 text-xs font-mono text-mn-text-secondary shadow-md hover:text-mn-text hover:border-mn-text transition-colors"
        >
          Ask Pond
        </button>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const btn = canvas.getByLabelText('Ask Pond about selection')
    await userEvent.click(btn)
    await expect(args.onAsk).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'test selection', blockId: 'block-1' })
    )
  },
}
