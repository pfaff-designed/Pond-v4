import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import { TerminalDrawer, TERMINAL_COLLAPSED_HEIGHT, TERMINAL_DEFAULT_HEIGHT } from './TerminalDrawer'

// #96: the card IS the column (534 wide, centred on the shell), so the footer
// and body own only their inner gutter — no offsets, no re-centring.
const sampleFooter = (
  <div className="flex-shrink-0 px-8">
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
)

const sampleBody = (
  <div className="flex-1 overflow-y-auto px-8 py-4">
    <p className="font-serif text-sm italic text-mn-text-faint">Start a conversation…</p>
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
    // #96: the handle spans the composer COLUMN (not the window), and the
    // visible grip is centred within it (justify-center on the inner wrapper).
    await expect(handle).toHaveClass('flex')
    await expect(handle).toHaveClass('items-center')
    const column = handle.closest('[data-part="composer-column"]')
    await expect(column).toBeTruthy()
    await expect(column).toHaveClass('w-[534px]')
    const grip = handle.querySelector('span')
    await expect(grip).toBeTruthy()
    await expect(grip).toHaveClass('justify-center')
    // the grip pill is the inner-inner span
    await expect(grip!.querySelector('span')).toBeTruthy()
  },
}

/**
 * `Pond 05 Shell` (measured): the composer is centred on the WHOLE shell at
 * calc(50% + 13px), 534 wide outside, 24px off the bottom — and the card's
 * flanks click through while the card and handle take the pointer.
 */
export const ShellCentred: Story = {
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('section')!
    await expect(section).toHaveClass('absolute')
    await expect(section).toHaveClass('bottom-0')
    await expect(section).toHaveClass('pointer-events-none')
    const column = section.querySelector<HTMLElement>('[data-part="composer-column"]')!
    await expect(column).toHaveClass('left-[calc(50%_+_13px)]')
    await expect(column).toHaveClass('-translate-x-1/2')
    await expect(column).toHaveClass('w-[534px]')
    const card = section.querySelector<HTMLElement>('[data-part="composer-card"]')!
    await expect(card).toHaveClass('mn-glass')
    await expect(card).toHaveClass('pointer-events-auto')
    await expect(card.getBoundingClientRect().width).toBe(534)
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
    const card = section.querySelector('.rounded-mn-card')
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
