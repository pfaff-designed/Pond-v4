import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'

import {
  TerminalDrawer,
  TERMINAL_COLLAPSED_HEIGHT,
  TERMINAL_DEFAULT_HEIGHT,
} from './TerminalDrawer'

const sampleFooter = (
  <div className="flex items-end gap-2 px-4 py-2 border-t border-press-hair">
    <textarea
      placeholder="Talk to Pond…"
      rows={2}
      className="flex-1 resize-none border border-border rounded px-3 py-2 text-sm font-mono bg-transparent"
    />
    <button className="px-3 py-2 bg-primary text-primary-foreground text-sm rounded-full">
      Send
    </button>
  </div>
)

const sampleBody = (
  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 font-mono text-sm">
    <p className="text-press-faint text-xs">Start a conversation…</p>
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
