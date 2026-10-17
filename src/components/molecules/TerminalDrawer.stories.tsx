import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { useRef, useState } from 'react'
import type { ComponentProps } from 'react'

import { ComposerLine } from './ComposerLine'
import { TerminalDrawer } from './TerminalDrawer'
import { COMPOSER_CLEARANCE_VAR } from '@/lib/layout/composer-clearance'
import {
  COMPOSER_DEFAULT_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  composerMaxHeight,
} from '@/lib/layout/composer-height'
import { ZEN_COMPOSER_CARD_OVERRIDE } from '@/lib/layout/zen'

/**
 * The shell-side of the PondComposer card: where it sits, that it publishes its
 * footprint, and the bare collapsed tab. The card's own values at rest / typing /
 * streaming are pinned in `ComposerLine.stories`.
 */

const Footer = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [research, setResearch] = useState(false)
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
        research={research}
        mentionTitles={[]}
        onSelectMode={(mode) => setResearch(mode === 'deep-research')}
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
  <div className="max-h-[calc(100dvh-14rem)] min-h-0 flex-1 overflow-y-auto group-data-[sized]/composer:max-h-none">
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
  title: 'Organisms/2f · the composer',
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
  tags: ['!dev'],
  play: async ({ canvasElement }) => {
    const shell = shellOf(canvasElement).getBoundingClientRect()
    const card = within(canvasElement).getByRole('region', { name: 'composer' })
    const box = card.getBoundingClientRect()
    await expect(Math.round(box.width)).toBe(560)
    await expect(box.left + box.width / 2 - shell.left).toBe(590 + 113)
    await expect(shell.bottom - box.bottom).toBe(24)
    await expect(card).toHaveClass('mn-glass')
  },
}

/** No header strip, clear control or context label — and no handle without a height owner. */
export const DrawsNothingButTheCard: Story = {
  tags: ['!dev'],
  args: { children: <Thread turns={1} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('separator')).toBeNull()
    await expect(canvas.queryByRole('button', { name: /clear conversation/i })).toBeNull()
    await expect(canvas.queryByText(/context:/)).toBeNull()
    await expect(canvas.queryByRole('button', { name: /collapse terminal/i })).toBeNull()
  },
}

/**
 * The card never grows with the thread: it sits at 392 and the thread scrolls
 * inside, until the person drags the handle on its top edge — never past the ⌘K
 * pill. ↑/↓ nudge it, Home/End jump to the bounds, a double-click returns to 392.
 */
export const WithTheHandle: Story = {
  name: 'with the handle',
  render: (args) => {
    const [height, setHeight] = useState<number | null>(null)
    return (
      <TerminalDrawer {...args} height={height} onHeightChange={setHeight} onHeightCommit={setHeight}>
        <Thread turns={4} />
      </TerminalDrawer>
    )
  },
  play: async ({ canvas, canvasElement }) => {
    const shell = shellOf(canvasElement)
    const card = canvas.getByRole('region', { name: 'composer' })
    const handle = canvas.getByRole('separator', { name: 'Resize composer' })
    const cardH = () => Math.round(card.getBoundingClientRect().height)
    await expect(cardH()).toBe(COMPOSER_DEFAULT_HEIGHT)

    // The grip: 40 × 4, centred on the card, riding its top edge.
    const grip = handle.firstElementChild!.getBoundingClientRect()
    const box = card.getBoundingClientRect()
    await expect([Math.round(grip.width), Math.round(grip.height)]).toEqual([40, 4])
    await expect(grip.left + grip.width / 2).toBeCloseTo(box.left + box.width / 2, 0)
    await expect(grip.bottom).toBeLessThanOrEqual(box.top)

    handle.focus()
    await userEvent.keyboard('{ArrowUp}')
    await expect(cardH()).toBe(COMPOSER_DEFAULT_HEIGHT + 24)
    await userEvent.keyboard('{Home}')
    await expect(cardH()).toBe(COMPOSER_MIN_HEIGHT)
    const thread = card.querySelector<HTMLElement>('.overflow-y-auto')!
    await expect(thread.scrollHeight).toBeGreaterThan(thread.clientHeight)

    // End: as tall as the shell allows — the top stays 72px below the shell's top.
    await userEvent.keyboard('{End}')
    await expect(cardH()).toBe(composerMaxHeight(shell.clientHeight))
    await expect(Math.round(card.getBoundingClientRect().top - shell.getBoundingClientRect().top)).toBe(72)

    await userEvent.dblClick(handle)
    await expect(cardH()).toBe(COMPOSER_DEFAULT_HEIGHT)
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
  const tab = within(canvasElement).getByRole('region', { name: 'Composer tab' })
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
  name: 'collapsed',
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
  name: 'collapsed · ink',
  args: { collapsed: true },
  decorators: [Themed('ink')],
  play: async ({ canvasElement }) => assertTab(canvasElement, 'ink', false),
}

/** An answer arrived while it was closed: a 6px dot and `pond answered`, nothing else. */
export const LandedPaper: Story = {
  name: 'landed',
  args: { collapsed: true, landed: true },
  play: async ({ canvasElement }) => assertTab(canvasElement, 'paper', true),
}

export const LandedInk: Story = {
  name: 'landed · ink',
  args: { collapsed: true, landed: true },
  decorators: [Themed('ink')],
  play: async ({ canvasElement }) => assertTab(canvasElement, 'ink', true),
}

/** Below md the tab is 360 wide, like the card. */
export const CollapsedMobile: Story = {
  name: 'collapsed · mobile',
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
    const tab = within(canvasElement).getByRole('region', { name: 'Composer tab' })
    await expect(Math.round(tab.getBoundingClientRect().width)).toBe(360)
  },
}

/**
 * Collapsed, the card stays mounted — grip, thread and footer intact, just slid
 * off screen — so it must not go on offering its controls to Tab. `inert`
 * (not the hand-set `tabIndex` it replaces) pulls the whole subtree out of the
 * tab order; the tab that visually took its place is what Tab reaches instead.
 * `userEvent.tab()` is synthetic and does not know about `inert` in jsdom, so
 * this has to live here rather than in a jest test — same reasoning as
 * `PondBlock.stories.tsx`'s `DisabledIsInert`.
 */
export const CollapsedCardIsInert: Story = {
  name: 'collapsed card is inert',
  args: { collapsed: true, children: <Thread turns={1} /> },
  render: (args) => (
    <div className="flex flex-col items-start gap-2">
      <button data-testid="before">before</button>
      <TerminalDrawer {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector<HTMLElement>('[data-part="composer-card"]')!
    await expect(card.hasAttribute('inert')).toBe(true)

    // The tab's "Open composer" button sits right after "before" in the DOM,
    // then the card's textarea and its attach / research buttons. A real
    // `.focus()` call on an `inert` element is a no-op (unlike jsdom, which has
    // no such guard) — so a Tab that computes one of those as its destination
    // just leaves focus exactly where it was, never inside the card.
    canvas.getByTestId('before').focus()
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Open composer' }))
    for (let i = 0; i < 3; i++) {
      await userEvent.tab()
      await expect(card.contains(document.activeElement)).toBe(false)
    }
  },
}

/**
 * ONE source for the composer's clearance: the card publishes its measured
 * height plus the 24px inset onto the shell as `--pond-composer-clearance`, keeps
 * it in step as the thread grows, and removes it with the card — a stale value
 * would pad a surface against a composer that is gone.
 */
export const PublishesItsClearanceToTheShell: Story = {
  tags: ['!dev'],
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
    const card = () => canvas.getByRole('region', { name: 'composer' })

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

// ── KAN-366: closed means gone, in every sizing state ───────────────────────
//
// A scroller standing in for the document the real bug lands in: the shell
// itself has no overflow clip, so a card that translates short of its own
// footprint (height + the 24px inset, not just the height) inflates the
// SCROLLER's scrollable area instead of leaving no trace below it.

const MadePageChipRow = () => (
  <div className="flex items-center gap-2 px-1.5 font-sans text-[13px]">
    <span className="rounded-full border border-mn-hair px-3 py-1">renovation plan</span>
    <span className="text-mn-text-secondary">made a page</span>
  </div>
)

const renderClosedInScroller = (args: ComponentProps<typeof TerminalDrawer>) => (
  <div data-testid="scroller" className="h-[30rem] w-[1180px] overflow-auto bg-mn-surface">
    <div data-part="shell" className="relative h-full">
      <TerminalDrawer {...args} />
    </div>
  </div>
)

async function assertClosedLeavesNoTrace(canvasElement: HTMLElement) {
  const scroller = within(canvasElement).getByTestId('scroller')
  // Collapsed, the card is `aria-hidden`/`inert` — querySelector, not getByRole.
  const card = scroller.querySelector<HTMLElement>('[data-part="composer-card"]')!
  const tab = within(scroller).getByRole('region', { name: 'Composer tab' })
  const scrollerBottom = scroller.getBoundingClientRect().bottom

  await expect(scroller.scrollHeight).toBe(scroller.clientHeight)
  await expect(card.getBoundingClientRect().top).toBeGreaterThanOrEqual(scrollerBottom)
  await expect(Math.round(tab.getBoundingClientRect().bottom)).toBe(Math.round(scrollerBottom))
}

export const ClosedAtTheDefaultHeight: Story = {
  name: 'closed · default height',
  args: { collapsed: true, children: <Thread turns={4} /> },
  render: renderClosedInScroller,
  play: async ({ canvasElement }) => assertClosedLeavesNoTrace(canvasElement),
}

export const ClosedAtADraggedHeight: Story = {
  name: 'closed · dragged height',
  args: { collapsed: true, height: 560, children: <Thread turns={4} /> },
  render: renderClosedInScroller,
  play: async ({ canvasElement }) => assertClosedLeavesNoTrace(canvasElement),
}

export const ClosedWithUnsizedContent: Story = {
  name: 'closed · unsized content',
  args: { collapsed: true, unsized: true, children: <MadePageChipRow /> },
  render: renderClosedInScroller,
  play: async ({ canvasElement }) => assertClosedLeavesNoTrace(canvasElement),
}

export const ClosedMaximized: Story = {
  name: 'closed · maximized',
  args: { collapsed: true, maximized: true, children: <Thread turns={4} /> },
  render: renderClosedInScroller,
  play: async ({ canvasElement }) => assertClosedLeavesNoTrace(canvasElement),
}

export const ClosedMinimized: Story = {
  name: 'closed · minimized',
  args: { collapsed: true, minimized: true, children: <Thread turns={4} /> },
  render: renderClosedInScroller,
  play: async ({ canvasElement }) => assertClosedLeavesNoTrace(canvasElement),
}

/**
 * Zen overrides the card's `bottom` by `!important`-ing the class that sets
 * `--composer-card-bottom`, not `bottom` itself — the inline style's `bottom:
 * var(--composer-card-bottom)` has to keep reading the overridden var rather
 * than get out-fought by a `bottom-[92px]!` utility the closed slide's own
 * `calc(100% + var(...))` would never see. Proves the var wins (92, not the
 * default 24) and that the closed slide clears the scroller by the zen
 * footprint, not the ordinary one.
 */
export const ClosedInZenClearsTheZenFootprint: Story = {
  name: 'closed · in zen, clears the zen footprint (92px)',
  args: { collapsed: true, children: <Thread turns={4} /> },
  render: (args) => (
    <div data-testid="scroller" className="h-[30rem] w-[1180px] overflow-auto bg-mn-surface">
      <div data-part="shell" className={`relative h-full ${ZEN_COMPOSER_CARD_OVERRIDE}`}>
        <TerminalDrawer {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scroller = within(canvasElement).getByTestId('scroller')
    const card = scroller.querySelector<HTMLElement>('[data-part="composer-card"]')!
    const scrollerBottom = scroller.getBoundingClientRect().bottom

    await expect(getComputedStyle(card).getPropertyValue('--composer-card-bottom').trim()).toBe(
      '92px'
    )
    await expect(scroller.scrollHeight).toBe(scroller.clientHeight)
    await expect(card.getBoundingClientRect().top).toBeGreaterThanOrEqual(scrollerBottom)
  },
}

/**
 * The slide must animate (280ms, `--ease-mn`), not jump — Tailwind v4's
 * `translate-y-*` utilities write the standalone `translate` property, which
 * `.motion-resolve` has to list alongside `transform` or only opacity eases.
 * `visibility` rides the same transition so the card leaves the a11y tree only
 * once the slide finishes; opening is instantly visible (CSS's to/from-`visible`
 * rule), closing hides at the end of the duration, never before.
 */
export const ClosedSlideAnimates: Story = {
  name: 'closed · slide animates, hides only after',
  tags: ['!dev'],
  render: (args) => {
    const [collapsed, setCollapsed] = useState(false)
    return (
      <>
        <button onClick={() => setCollapsed(true)}>close</button>
        <TerminalDrawer {...args} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
      </>
    )
  },
  args: { children: <Thread turns={1} /> },
  play: async ({ canvas, canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-part="composer-card"]')!
    const style = getComputedStyle(card)
    await expect(style.transitionProperty.split(', ')).toEqual(expect.arrayContaining(['transform']))
    await expect(style.visibility).toBe('visible')

    await userEvent.click(canvas.getByText('close'))
    // Right after the toggle the slide has only just started — still visible.
    await expect(style.visibility).toBe('visible')
    await waitFor(() => expect(style.visibility).toBe('hidden'), { timeout: 1000 })
  },
}

/**
 * `translate` must NOT be a transitioned property: the card's placement swaps
 * between the centred class (`-translate-x-1/2`, a `translate` value) and the
 * maximized inset (no translate utility at all) on every maximize/restore, and
 * if `.motion-resolve` eased that change the full-width card would appear to
 * start half its width to the left and slide right. The closed slide animates
 * through `transform` instead, which stays listed.
 */
export const MaximizeDoesNotSlideSideways: Story = {
  name: 'maximize/restore does not animate translate',
  tags: ['!dev'],
  render: (args) => {
    const [maximized, setMaximized] = useState(false)
    return (
      <>
        <button onClick={() => setMaximized((value) => !value)}>toggle maximized</button>
        <TerminalDrawer {...args} maximized={maximized} />
      </>
    )
  },
  args: { children: <Thread turns={1} /> },
  play: async ({ canvas, canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-part="composer-card"]')!
    const style = getComputedStyle(card)
    await expect(style.transitionProperty.split(', ')).not.toEqual(expect.arrayContaining(['translate']))

    await userEvent.click(canvas.getByText('toggle maximized'))
    // No `translate` transition means no running animation on that property —
    // the placement swap (and its implied translate jump) lands in one frame.
    await expect(card.getAnimations().length).toBe(0)
  },
}
