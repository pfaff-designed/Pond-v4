import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { ContentWidthHandle } from './ContentWidthHandle'
import {
  CONTENT_DEFAULT_WIDTH,
  CONTENT_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  CONTENT_WIDTH_STEP,
} from '@/lib/layout/content-width'

/** The handle in situ: a centered column (like the editor's page-column) with
 *  the strip on its right edge, over sample prose so the grip reads in context. */
function ColumnFrame({
  width,
  children,
}: {
  width: number
  children: React.ReactNode
}) {
  return (
    <div className="h-[420px] overflow-y-auto bg-mn-surface font-sans">
      <div className="relative mx-auto px-8 py-8" style={{ maxWidth: width }}>
        <h1 className="font-serif text-2xl font-semibold text-mn-text">Workshop notes</h1>
        <p className="mt-4 text-sm text-mn-text-meta">
          The bench height question again: 34&quot; suits handwork, 36&quot; suits machines.
          Split the difference and regret both, or build the low bench first and let the
          assembly table be tall.
        </p>
        {children}
      </div>
    </div>
  )
}

const meta = {
  title: 'Molecules/ContentWidthHandle',
  component: ContentWidthHandle,
  parameters: { layout: 'fullscreen' },
  args: {
    width: CONTENT_DEFAULT_WIDTH,
    onWidthChange: fn(),
    onWidthCommit: fn(),
    className: 'absolute inset-y-8 right-0',
  },
  decorators: [
    (Story, { args }) => (
      <ColumnFrame width={args.width}>
        <Story />
      </ColumnFrame>
    ),
  ],
} satisfies Meta<typeof ContentWidthHandle>

export default meta
type Story = StoryObj<typeof meta>

/** The ARIA contract (#58): a focusable vertical separator that reports its
 *  value and bounds — the window-splitter pattern, matching the terminal
 *  drawer's horizontal sibling. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize page width' })
    await expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    await expect(handle).toHaveAttribute('aria-valuenow', String(CONTENT_DEFAULT_WIDTH))
    await expect(handle).toHaveAttribute('aria-valuemin', String(CONTENT_MIN_WIDTH))
    await expect(handle).toHaveAttribute('aria-valuemax', String(CONTENT_MAX_WIDTH))
    await expect(handle).toHaveAttribute('tabindex', '0')
    await expect(handle).toHaveClass('cursor-ew-resize')
  },
}

/** Keyboard resize: ←/→ on the focused handle actually change the rendered
 *  column width (stateful render so the controlled width round-trips), each
 *  press commits, and the reported aria-valuenow tracks. */
export const KeyboardResize: Story = {
  render: (args) => {
    const [width, setWidth] = useState(args.width)
    return (
      <ColumnFrame width={width}>
        <ContentWidthHandle
          {...args}
          width={width}
          onWidthChange={(w) => {
            setWidth(w)
            args.onWidthChange(w)
          }}
        />
      </ColumnFrame>
    )
  },
  // The stateful render supplies its own frame; drop the meta decorator's.
  decorators: [(Story) => <Story />],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize page width' })
    const column = handle.parentElement!
    await expect(column.style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH}px`)
    handle.focus()
    await userEvent.keyboard('{ArrowRight}')
    // Grew by one step — asserted on the rendered column, not just the callback.
    await expect(column.style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH + CONTENT_WIDTH_STEP}px`)
    await expect(handle).toHaveAttribute(
      'aria-valuenow',
      String(CONTENT_DEFAULT_WIDTH + CONTENT_WIDTH_STEP)
    )
    await expect(args.onWidthCommit).toHaveBeenCalledWith(
      CONTENT_DEFAULT_WIDTH + CONTENT_WIDTH_STEP
    )
    await userEvent.keyboard('{ArrowLeft}')
    await expect(column.style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH}px`)
    // Home/End jump to the clamped bounds.
    await userEvent.keyboard('{End}')
    await expect(column.style.maxWidth).toBe(`${CONTENT_MAX_WIDTH}px`)
    await userEvent.keyboard('{Home}')
    await expect(column.style.maxWidth).toBe(`${CONTENT_MIN_WIDTH}px`)
  },
}

/** At the ceiling the handle stays put on further grow presses — the clamp is
 *  the molecule's, so no parent can be talked into an out-of-band width. */
export const ClampedAtMax: Story = {
  args: { width: CONTENT_MAX_WIDTH },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize page width' })
    handle.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(args.onWidthChange).toHaveBeenCalledWith(CONTENT_MAX_WIDTH)
  },
}
