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
    onExpand: fn(),
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

// ── `PondComposer` `collapsed` / `landed`: the tab, in paper and ink ───────────
//
// Every assertion is the COMPUTED value against the DC's literal (`tabWrap`,
// `tabPill`, `landedDot`, `tabKey`), at the desktop breakpoint (W = 560).

type Theme = 'paper' | 'ink'

const INK: Record<Theme, string> = { paper: '27, 29, 20', ink: '250, 249, 239' }

const Themed = (theme: Theme) =>
  function ThemedDecorator(Story: () => React.ReactElement) {
    return (
      <div className={theme === 'ink' ? 'dark' : ''}>
        <Story />
      </div>
    )
  }

async function assertTab(canvasElement: HTMLElement, theme: Theme, landed: boolean) {
  const shell = shellOf(canvasElement).getBoundingClientRect()
  const tab = within(canvasElement).getByRole('region', { name: 'Pond terminal' })
  const box = tab.getBoundingClientRect()
  const style = getComputedStyle(tab)

  // tabWrap: 560 × 30, radius 14 16 0 0, no bottom border, on the bottom edge
  await expect(Math.round(box.width)).toBe(560)
  await expect(Math.round(box.height)).toBe(30)
  await expect(style.borderTopLeftRadius).toBe('14px')
  await expect(style.borderTopRightRadius).toBe('16px')
  await expect(style.borderBottomLeftRadius).toBe('0px')
  await expect(style.borderBottomRightRadius).toBe('0px')
  await expect(style.borderBottomWidth).toBe('0px')
  await expect(box.left + box.width / 2 - shell.left).toBe(590 + 113)
  await expect(shell.bottom - box.bottom).toBe(0)
  await expect(style.backgroundImage).toContain(
    theme === 'ink' ? 'rgba(48, 49, 42, 0.92)' : 'rgba(255, 255, 255, 0.86)'
  )
  // The shadow is thrown UP: pill.boxShadow.
  await expect(style.boxShadow).toBe(
    theme === 'ink'
      ? 'rgba(250, 249, 239, 0.06) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.3) 0px -8px 28px 0px'
      : 'rgba(255, 255, 255, 0.7) 0px 1px 0px 0px inset, rgba(40, 34, 24, 0.12) 0px -8px 28px 0px'
  )

  // tabPill: top -13 from the tab's padding edge (the 1px glass border sits outside it,
  // exactly as in the DC), centred, 26 high, padding 0 14, gap 8, mono 11
  const pill = tab.querySelector<HTMLElement>('[data-part="tab-pill"]')!
  const pillBox = pill.getBoundingClientRect()
  const pillStyle = getComputedStyle(pill)
  await expect(Math.round(box.top - pillBox.top)).toBe(12)
  await expect(Math.round(pillBox.height)).toBe(26)
  await expect(pillBox.left + pillBox.width / 2).toBeCloseTo(box.left + box.width / 2, 0)
  await expect(pillStyle.paddingLeft).toBe('14px')
  await expect(pillStyle.paddingRight).toBe('14px')
  await expect(pillStyle.columnGap).toBe('8px')
  await expect(pillStyle.fontSize).toBe('11px')
  await expect(pillStyle.fontFamily).toMatch(/Mono|monospace/)
  await expect(parseFloat(pillStyle.borderTopLeftRadius)).toBeGreaterThanOrEqual(13)
  await expect(pillStyle.boxShadow).toBe(style.boxShadow)
  const chevron = pill.querySelector('svg')!
  await expect(chevron.getAttribute('width')).toBe('10')
  await expect(chevron.querySelector('path')!.getAttribute('d')).toBe('M2 6.5 5 3.5l3 3')

  // landedDot 6 × 6 in ink + `pond answered`, only when something landed
  const dot = pill.querySelector<HTMLElement>('[data-part="landed-dot"]')
  if (!landed) {
    await expect(dot).toBeNull()
    await expect(within(pill).queryByText('pond answered')).toBeNull()
  } else {
    await expect(within(pill).getByText('pond answered')).toBeInTheDocument()
    const dotStyle = getComputedStyle(dot!)
    await expect(dotStyle.width).toBe('6px')
    await expect(dotStyle.height).toBe('6px')
    await expect(dotStyle.backgroundColor).toBe(`rgb(${INK[theme]})`)
  }

  // tabKey: ⌘J, mono 10.5, ink .68, margin-top 12
  const key = within(tab).getByText('⌘J')
  const keyStyle = getComputedStyle(key)
  await expect(keyStyle.fontSize).toBe('10.5px')
  await expect(keyStyle.marginTop).toBe('12px')
  await expect(keyStyle.color).toBe(`rgba(${INK[theme]}, 0.68)`)
}

export const CollapsedPaper: Story = {
  args: { collapsed: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await assertTab(canvasElement, 'paper', false)
    await userEvent.click(canvas.getByRole('button', { name: 'Open composer' }))
    await expect(args.onExpand).toHaveBeenCalledTimes(1)
  },
}

export const CollapsedInk: Story = {
  args: { collapsed: true },
  decorators: [Themed('ink')],
  play: async ({ canvasElement }) => assertTab(canvasElement, 'ink', false),
}

/** An answer arrived while it was closed: a 6px dot and `pond answered`, nothing else. */
export const LandedPaper: Story = {
  args: { collapsed: true, landed: true },
  play: async ({ canvasElement }) => assertTab(canvasElement, 'paper', true),
}

export const LandedInk: Story = {
  args: { collapsed: true, landed: true },
  decorators: [Themed('ink')],
  play: async ({ canvasElement }) => assertTab(canvasElement, 'ink', true),
}

/** Below md the tab is 360 wide, like the card. */
export const CollapsedMobile: Story = {
  args: { collapsed: true },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  decorators: [
    (Story) => (
      <div data-part="shell" className="relative h-[20rem] w-[414px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const tab = within(canvasElement).getByRole('region', { name: 'Pond terminal' })
    await expect(Math.round(tab.getBoundingClientRect().width)).toBe(360)
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
