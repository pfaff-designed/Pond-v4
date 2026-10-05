import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useRef, useState } from 'react'

import { ComposerLine } from './ComposerLine'
import { TerminalDrawer } from './TerminalDrawer'
import { COMPOSER_CLEARANCE_VAR } from '@/lib/layout/composer-clearance'

/**
 * The shell-side of the PondComposer card: where it sits, that it publishes its
 * footprint, and the bare collapsed tab. The card's own values at rest / typing /
 * streaming are pinned in `ComposerLine.stories`.
 */

const Footer = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  return (
    <div className="flex flex-col gap-[14px]">
      <ComposerLine
        value={value}
        placeholder="ask pond, or / for blocks"
        disabled={false}
        streaming={false}
        canSend={value.trim().length > 0}
        attachDisabled={false}
        textareaRef={textareaRef}
        anchorRef={anchorRef}
        onChange={setValue}
        onKeyDown={fn()}
        onAttach={fn()}
        onSend={fn()}
        onStop={fn()}
      />
    </div>
  )
}

const Thread = ({ turns }: { turns: number }) => (
  <div className="max-h-[calc(100dvh-14rem)] min-h-0 overflow-y-auto">
    <div className="space-y-5 px-1.5">
      {Array.from({ length: turns }, (_, i) => (
        <p key={i} className="font-sans text-[15px] leading-[1.6]">
          One thing: the cabinet quote. The worktop template cannot be booked until the carcasses
          are measured.
        </p>
      ))}
    </div>
  </div>
)

const meta = {
  title: 'Molecules/TerminalDrawer',
  component: TerminalDrawer,
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: {
    collapsed: false,
    onToggleCollapsed: fn(),
    children: null,
    footer: <Footer />,
  },
  // The shell the composer floats over: relative, the storyboards' 1180 frame.
  decorators: [
    (Story) => (
      <div data-part="shell" className="relative h-[40rem] w-[1180px] bg-mn-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TerminalDrawer>

export default meta
type Story = StoryObj<typeof meta>

const shellOf = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('[data-part="shell"]')!

/**
 * `left:246px; right:20px; bottom:24px` in a 1180 frame (rail 20+206+20): the
 * card's centre is 590 + 113 from the shell's left edge, and its bottom is 24
 * above the shell's bottom.
 */
export const CentredRightOfTheRail: Story = {
  play: async ({ canvasElement }) => {
    const shell = shellOf(canvasElement).getBoundingClientRect()
    const card = within(canvasElement).getByRole('region', { name: 'Pond terminal' })
    const box = card.getBoundingClientRect()
    await expect(Math.round(box.width)).toBe(560)
    await expect(box.left + box.width / 2 - shell.left).toBe(590 + 113)
    await expect(shell.bottom - box.bottom).toBe(24)
    await expect(card).toHaveClass('mn-glass')
  },
}

/** No header strip, resize handle, clear control or context label. */
export const DrawsNothingButTheCard: Story = {
  args: { children: <Thread turns={1} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('separator')).toBeNull()
    await expect(canvas.queryByRole('button', { name: /clear conversation/i })).toBeNull()
    await expect(canvas.queryByText(/context:/)).toBeNull()
    await expect(canvas.queryByRole('button', { name: /collapse terminal/i })).toBeNull()
  },
}

/** Collapsed: a bare tab; the line and toolbar are gone. */
export const Collapsed: Story = {
  args: { collapsed: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Expand terminal' }))
    await expect(args.onToggleCollapsed).toHaveBeenCalledTimes(1)
  },
}

/**
 * ONE source for the composer's clearance: the card publishes its measured
 * height plus the 24px inset onto the shell as `--pond-composer-clearance`, keeps
 * it in step as the thread grows, and removes it with the card — a stale value
 * would pad a surface against a composer that is gone.
 */
export const PublishesItsClearanceToTheShell: Story = {
  render: (args) => {
    const [turns, setTurns] = useState<number | null>(0)
    return (
      <>
        <div className="absolute top-4 left-4 flex gap-2">
          <button onClick={() => setTurns(3)}>grow the thread</button>
          <button onClick={() => setTurns(null)}>unmount</button>
        </div>
        {turns !== null && (
          <TerminalDrawer {...args}>{turns > 0 ? <Thread turns={turns} /> : null}</TerminalDrawer>
        )}
      </>
    )
  },
  play: async ({ canvas, canvasElement }) => {
    const shell = shellOf(canvasElement)
    const published = () => shell.style.getPropertyValue(COMPOSER_CLEARANCE_VAR)
    const card = () => canvas.getByRole('region', { name: 'Pond terminal' })

    // At rest: the card is 101 tall (14 + 25 + 14 + 32 + 14, plus the 1px border).
    await expect(published()).toBe('125px')

    await userEvent.click(canvas.getByText('grow the thread'))
    await waitFor(() =>
      expect(published()).toBe(`${Math.round(card().getBoundingClientRect().height) + 24}px`)
    )
    await expect(Math.round(card().getBoundingClientRect().height)).toBeGreaterThan(101)

    await userEvent.click(canvas.getByText('unmount'))
    await expect(published()).toBe('')
  },
}
