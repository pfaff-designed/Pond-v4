import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import { ContentWidthHandle, type ContentWidthHandleProps } from './ContentWidthHandle'
import {
  CONTENT_DEFAULT_WIDTH,
  CONTENT_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  CONTENT_WIDTH_STEP,
} from '@/lib/layout/content-width'

/** The handle in situ: a centered column (like the editor's page-column) with
 *  the strip on its right edge, over sample prose so the grip reads in context. */
function ColumnFrame({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div className="h-[420px] overflow-y-auto bg-mn-surface font-sans">
      <div className="relative mx-auto px-8 py-8" style={{ maxWidth: width }}>
        <h1 className="font-serif text-2xl font-semibold text-mn-text">Workshop notes</h1>
        <p className="mt-4 text-sm text-mn-text-meta">
          The bench height question again: 34&quot; suits handwork, 36&quot; suits machines. Split
          the difference and regret both, or build the low bench first and let the assembly table be
          tall.
        </p>
        {children}
      </div>
    </div>
  )
}

/** Stateful host: the column owns the width, as DocumentPanel does — so a
 *  gesture's live reports are asserted on the RENDERED column (and on the
 *  reported aria-valuenow) rather than on the callback alone. */
function StatefulColumn(args: ContentWidthHandleProps) {
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
}

/** A real `PointerEvent` — the whole reason the drag belongs here. jsdom has no
 *  PointerEvent constructor, so the jest version had to dispatch bare `Event`s
 *  with `pointerId`/`clientX` assigned on; in the browser the gesture is the
 *  genuine article, including `setPointerCapture`. */
function firePointer(el: Element, type: string, init: PointerEventInit) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }))
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
    // The COMPUTED cursor and hit width, not the class names that produce them:
    // a renamed utility keeps the class assertion green while the strip stops
    // reading (or catching) as a resize affordance.
    const cs = getComputedStyle(handle)
    await expect(cs.cursor).toBe('ew-resize')
    await expect(cs.width).toBe('16px')
    // `touch-none`: without it a touch drag is eaten by the page scroller.
    await expect(cs.touchAction).toBe('none')
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

/**
 * The pointer gesture, end to end (#58), as one drag rather than four:
 * press → the column tracks the cursor at 2× the pointer delta (it is centered,
 * so half the growth goes to each side and the right edge stays under the
 * finger) → a SECOND pointer landing mid-drag changes nothing (multi-touch
 * jitter) → nothing is committed until the gesture ends → pointerup commits the
 * last width the person actually saw, and hands the page's cursor back.
 *
 * The `user-select`/`cursor` lifecycle is here because getting it wrong is
 * silent: the drag works, and the whole app is left stuck in `ew-resize` with
 * text unselectable.
 */
export const PointerDrag: Story = {
  render: (args) => <StatefulColumn {...args} />,
  decorators: [(Story) => <Story />],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize page width' })
    const column = handle.parentElement!

    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    await expect(getComputedStyle(document.body).cursor).toBe('ew-resize')
    await expect(getComputedStyle(document.body).userSelect).toBe('none')

    // A live report rides React's scheduler (pointermove is a continuous event),
    // so the rendered column is awaited rather than read in the same tick.
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 340 })
    await waitFor(() => expect(column.style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH + 80}px`))
    await expect(handle).toHaveAttribute('aria-valuenow', String(CONTENT_DEFAULT_WIDTH + 80))

    // A second finger mid-gesture is not this drag: the column must not move.
    firePointer(handle, 'pointermove', { pointerId: 2, clientX: 900 })
    await expect(column.style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH + 80}px`)

    // Dragging back in shrinks from the gesture's START width, not cumulatively.
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 320 })
    await waitFor(() => expect(column.style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH + 40}px`))
    await expect(args.onWidthCommit).not.toHaveBeenCalled()

    firePointer(handle, 'pointerup', { pointerId: 1, clientX: 320 })
    await expect(args.onWidthCommit).toHaveBeenCalledWith(CONTENT_DEFAULT_WIDTH + 40)
    // The page is handed back: no stuck resize cursor, text selectable again.
    await expect(document.body.style.cursor).toBe('')
    await expect(document.body.style.userSelect).toBe('')
  },
}

/** A drag far past the ceiling stops at it, and the commit carries the clamped
 *  width — so a wild gesture can never persist an out-of-band column. */
export const DragClampedAtCeiling: Story = {
  render: (args) => <StatefulColumn {...args} />,
  decorators: [(Story) => <Story />],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize page width' })
    const column = handle.parentElement!
    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 3000 })
    await waitFor(() => expect(column.style.maxWidth).toBe(`${CONTENT_MAX_WIDTH}px`))
    firePointer(handle, 'pointerup', { pointerId: 1, clientX: 3000 })
    await expect(args.onWidthCommit).toHaveBeenCalledWith(CONTENT_MAX_WIDTH)
  },
}

/** `pointercancel` (a touch-scroll takeover, an OS interrupt) ends the gesture
 *  exactly as a release does, committing the last width the person SAW — the
 *  cancel event's own coordinates can be garbage, so they are never read. */
export const DragCancelledCommitsLastSeenWidth: Story = {
  render: (args) => <StatefulColumn {...args} />,
  decorators: [(Story) => <Story />],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize page width' })
    firePointer(handle, 'pointerdown', { pointerId: 1, clientX: 300 })
    firePointer(handle, 'pointermove', { pointerId: 1, clientX: 350 })
    firePointer(handle, 'pointercancel', { pointerId: 1, clientX: 99999 })
    await expect(args.onWidthCommit).toHaveBeenCalledWith(CONTENT_DEFAULT_WIDTH + 100)
    await expect(document.body.style.cursor).toBe('')
  },
}
