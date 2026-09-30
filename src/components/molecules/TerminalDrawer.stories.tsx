import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import {
  TerminalDrawer,
  TERMINAL_COLLAPSED_HEIGHT,
  TERMINAL_DEFAULT_HEIGHT,
  RAIL_WIDTH_PX,
} from './TerminalDrawer'

// ticket-42: footer confines its visible chrome (border + composer) to the
// same column the transcript uses — no full-width hairline edge-to-edge.
const sampleFooter = (
  <div className="flex-shrink-0" style={{ paddingLeft: RAIL_WIDTH_PX }}>
    <div className="mx-auto w-full max-w-2xl px-8">
      <div className="border-t border-mn-hair">
        <div className="flex items-end gap-4 py-3">
          <textarea
            placeholder="Talk to Pond…"
            rows={2}
            className="flex-1 resize-none border-0 border-b border-mn-line bg-transparent px-0 py-1.5 font-mono text-sm"
          />
          <button className="self-end pb-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-mn-text">
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
)

// ticket-42: body also uses RAIL_WIDTH_PX via inline style so text + chrome
// share the single metric and can't drift.
const sampleBody = (
  <div className="flex-1 overflow-y-auto py-4" style={{ paddingLeft: RAIL_WIDTH_PX }}>
    <div className="mx-auto w-full max-w-2xl px-8">
      <p className="font-serif text-sm italic text-mn-text-faint">Start a conversation…</p>
    </div>
  </div>
)

const meta = {
  title: 'Molecules/TerminalDrawer',
  component: TerminalDrawer,
  parameters: { layout: 'fullscreen' },
  args: {
    contextLabel: 'Life',
    height: TERMINAL_DEFAULT_HEIGHT,
    collapsed: false,
    onToggleCollapsed: fn(),
    onHeightChange: fn(),
    onHeightCommit: fn(),
    onClear: fn(),
    canClear: true,
    children: sampleBody,
    footer: sampleFooter,
  },
} satisfies Meta<typeof TerminalDrawer>

export default meta
type Story = StoryObj<typeof meta>

/** Expanded: header controls, resize handle, body and footer all visible. */
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Life')).toBeInTheDocument()
    await expect(canvas.getByRole('separator', { name: 'Resize terminal' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Clear conversation' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Collapse terminal' })).toBeInTheDocument()
    // Body + footer present when expanded.
    await expect(canvas.getByText('Start a conversation…')).toBeInTheDocument()
    await expect(canvas.getByPlaceholderText('Talk to Pond…')).toBeInTheDocument()
  },
}

/** Collapsed: only the header strip remains; body, footer and handle are gone. */
export const Collapsed: Story = {
  args: { collapsed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Expand terminal' })).toBeInTheDocument()
    // Handle + body + footer hidden while collapsed.
    await expect(canvas.queryByRole('separator', { name: 'Resize terminal' })).toBeNull()
    await expect(canvas.queryByPlaceholderText('Talk to Pond…')).toBeNull()
  },
}

/** The collapse toggle raises onToggleCollapsed. */
export const ToggleCollapse: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse terminal' }))
    await expect(args.onToggleCollapsed).toHaveBeenCalledTimes(1)
  },
}

/** The visible Clear control raises onClear (the ticket-24 affordance, not placeholder text). */
export const ClearControl: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Clear conversation' }))
    await expect(args.onClear).toHaveBeenCalledTimes(1)
  },
}

/** Clear is disabled (inert) when there is nothing to clear. */
export const ClearDisabledWhenEmpty: Story = {
  args: { canClear: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const clear = canvas.getByRole('button', { name: 'Clear conversation' })
    await expect(clear).toBeDisabled()
    await userEvent.click(clear)
    await expect(args.onClear).not.toHaveBeenCalled()
  },
}

/** The resize handle carries a visible centered grip affordance (Fix-3 / F7). */
export const GripVisible: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByRole('separator', { name: 'Resize terminal' })
    // ticket-42 follow-up: the handle stays a full-width drag target (flex +
    // items-center), but the visible grip is centered WITHIN the column via an
    // inner max-w-2xl wrapper (justify-center lives there, not on the handle).
    await expect(handle).toHaveClass('flex')
    await expect(handle).toHaveClass('items-center')
    const columnWrap = handle.querySelector('span')
    await expect(columnWrap).toBeTruthy()
    await expect(columnWrap).toHaveClass('justify-center')
    await expect(columnWrap).toHaveClass('max-w-2xl')
    // the grip pill is the inner-inner span
    await expect(columnWrap!.querySelector('span')).toBeTruthy()
  },
}

/** ticket-42 + transparent chat: the outer section carries no background, and the
 *  chat panel itself is fully see-through — no fill, border, or shadow, and the
 *  header wash is dropped — so the paper shows through the whole terminal. */
export const ColumnConfined: Story = {
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('section')!
    // Outer section must be transparent — no bg-card or border-t.
    await expect(section).not.toHaveClass('bg-card')
    await expect(section).not.toHaveClass('border-t')
    // The chat is ONE rounded panel within the column, now fully transparent:
    // no fill, border, or shadow — the page shows straight through.
    const card = section.querySelector('.rounded-2xl')
    await expect(card).toBeTruthy()
    await expect(card).not.toHaveClass('bg-card')
    await expect(card).not.toHaveClass('border')
    await expect(card).not.toHaveClass('shadow-sm')
    // The header no longer carries the accent wash.
    await expect(section.querySelector('[class*="bg-mn-wash"]')).toBeNull()
    // Context label is still readable.
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Life')).toBeInTheDocument()
  },
}

/** Keyboard resize: ↑/↓ on the handle actually change the rendered drawer height
 *  (stateful render so the controlled height round-trips), and each nudge commits. */
export const KeyboardResize: Story = {
  render: (args) => {
    const [height, setHeight] = useState(args.height)
    return (
      <TerminalDrawer
        {...args}
        height={height}
        onHeightChange={(h) => {
          setHeight(h)
          args.onHeightChange(h)
        }}
      />
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const section = canvasElement.querySelector('section')!
    const handle = canvas.getByRole('separator', { name: 'Resize terminal' })
    await expect(section.style.height).toBe(
      `${TERMINAL_DEFAULT_HEIGHT + TERMINAL_COLLAPSED_HEIGHT}px`
    )
    handle.focus()
    await userEvent.keyboard('{ArrowUp}')
    // Grew by 24px from the default — asserted on the rendered element, not just the callback.
    await expect(section.style.height).toBe(
      `${TERMINAL_DEFAULT_HEIGHT + 24 + TERMINAL_COLLAPSED_HEIGHT}px`
    )
    await expect(args.onHeightChange).toHaveBeenCalledWith(TERMINAL_DEFAULT_HEIGHT + 24)
    await expect(args.onHeightCommit).toHaveBeenCalledWith(TERMINAL_DEFAULT_HEIGHT + 24)
    await userEvent.keyboard('{ArrowDown}')
    await expect(section.style.height).toBe(
      `${TERMINAL_DEFAULT_HEIGHT + TERMINAL_COLLAPSED_HEIGHT}px`
    )
  },
}
