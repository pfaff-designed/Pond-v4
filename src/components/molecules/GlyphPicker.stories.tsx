import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { page } from 'vitest/browser'
import { expect, fn, userEvent, within } from 'storybook/test'

import { GlyphPicker, type GlyphPickerProps } from './GlyphPicker'
import { markAccent } from '@/lib/rail/glyph-library'

/**
 * `PondPicker kind="glyph"` (KAN-248 3/4, chrome; 4/8, keys and search). The
 * anchored glass here is desktop-only now (Rail sends every phone through
 * `GlyphPickerSheet.tsx`'s bottom sheet instead — its `Sheet` story pins the
 * DC's own `mob` branch numbers). `Desktop`/`AreaTarget` still check the DC's
 * own desktop numbers — `W = 320`, `cs = 34`, `cols = 8`, the cell's
 * `borderRadius` (`10`), and `inheritNote`. `Keyboard` drives the flow
 * itself: search narrows the grid, ← → ↑ ↓ move the active cell into and out
 * of the automatic row, ↵ picks, esc closes with nothing picked.
 */

const px = (v: string) => parseFloat(v)

/**
 * Tailwind v4 compiles an opacity modifier on a named colour (`border-white/90`)
 * to `color-mix(in oklab, …)`, so Chromium serialises that one computed value as
 * `oklab(L a b / α)` while a literal arbitrary rgba (the dark `border-[…]`) comes
 * back as `rgba(…)` — same decoder as `MadeFromChip.stories.tsx`'s own `srgb`.
 */
function srgb(value: string): [number, number, number, number] {
  const ok = value.match(/^oklab\(([^)]+)\)$/)
  if (!ok) {
    const plain = value.match(/^rgba?\(([^)]+)\)$/)
    if (!plain) throw new Error(`GlyphPicker stories: unparsed colour "${value}"`)
    const n = plain[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    return [n[0], n[1], n[2], n[3] ?? 1]
  }
  const [L, a, b, alpha] = ok[1]
    .split(/[\s/]+/)
    .filter(Boolean)
    .map(Number)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const k = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * k,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * k,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * k,
  ]
  const encode = (c: number) => {
    const x = Math.min(1, Math.max(0, c))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }
  return [
    Math.round(encode(linear[0]) * 255),
    Math.round(encode(linear[1]) * 255),
    Math.round(encode(linear[2]) * 255),
    alpha ?? 1,
  ]
}

/** Assert a computed colour against a board literal, within 1/255 + .01 alpha. */
async function expectColour(actual: string, expected: readonly [number, number, number, number]) {
  const got = srgb(actual)
  for (let i = 0; i < 3; i += 1) await expect(Math.abs(got[i] - expected[i])).toBeLessThanOrEqual(1)
  await expect(Math.abs(got[3] - expected[3])).toBeLessThanOrEqual(0.01)
}

/** `ink`, matching `SourcePicker.stories.tsx`'s own frame — the `.dark` class around
 * the portal's container is the whole theme; nothing else changes shape. */
type FrameProps = Omit<GlyphPickerProps, 'anchor' | 'container'> & { ink?: boolean }

function Frame({ ink, ...props }: FrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <div
      ref={setContainer}
      data-theme={ink ? 'ink' : 'paper'}
      className={`relative h-[560px] w-[460px] rounded-mn-inner p-mn-6 ${
        ink ? 'dark bg-raw-ink' : 'bg-raw-paper'
      }`}
    >
      <button ref={anchor} type="button" className="text-mn-text">
        change icon for workouts
      </button>
      {container && <GlyphPicker anchor={anchor} container={container} {...props} />}
    </div>
  )
}

const meta = {
  title: 'Organisms/pickers/2h · the glyph picker',
  component: Frame,
  parameters: { layout: 'centered' },
  args: {
    target: { isArea: false, title: 'workouts' },
    current: null,
    inheritsFrom: 'health',
    onPick: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

const glassOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-part="glass"]')!

/**
 * The glass caps its own box to `room`, so a glass with no slack lands its far
 * edge exactly on the viewport edge. Real Chromium layout doesn't hit that
 * float exactly — flex/border sub-pixel rounding lands the rendered edge a few
 * tenths of a px either side of it from run to run (observed here, not
 * asserted: ~900.0–900.2 across repeat runs at the SAME anchor). A tolerance
 * this small still catches the defect class this file exists to catch — the
 * 10.5px / 8.75px overshoots of the hand-estimated cap, and the 3.8125px /
 * 2.664px of the measured one — by one to two orders of magnitude.
 */
const SUBPIXEL_TOLERANCE_PX = 1

/**
 * `glass` width/radius/padding, every cell's size/radius, the grid's own
 * column count — the DC's `kind=glyph` numbers for the desktop size (the
 * anchored glass's only size now; the `mob` branch's own numbers are pinned
 * by `GlyphPickerSheet.stories.tsx`'s `Sheet` story).
 */
async function assertGlyphKindNumbers(root: HTMLElement, recentShown: boolean) {
  const glass = glassOf(root)
  await expect(glass.dataset.kind).toBe('glyph')
  const g = getComputedStyle(glass)
  await expect(px(g.width)).toBe(320)
  await expect(g.borderTopLeftRadius).toBe('20px')
  await expect(g.borderBottomLeftRadius).toBe('20px')
  await expect(g.paddingTop).toBe('10px')
  await expect(g.paddingLeft).toBe('10px')
  await expect(g.paddingBottom).toBe('10px')

  const sections = glass.querySelectorAll<HTMLElement>('[data-part="section"]')
  const labels = [...sections].map((s) => s.querySelector('span')!.textContent)
  await expect(labels).toEqual(recentShown ? ['recent', 'library'] : ['library'])

  const library = [...sections].find((s) => s.querySelector('span')!.textContent === 'library')!
    .lastElementChild as HTMLElement
  await expect(library.getAttribute('role')).toBe('grid')
  const rows = library.querySelectorAll<HTMLElement>('[role="row"]')
  await expect(rows.length).toBeGreaterThan(1)
  await expect(rows[0].querySelectorAll('[role="gridcell"]')).toHaveLength(8)

  const cell = library.querySelector<HTMLElement>('[role="gridcell"]')!
  const c = getComputedStyle(cell)
  await expect(px(c.width)).toBe(34)
  await expect(px(c.height)).toBe(34)
  await expect(c.borderTopLeftRadius).toBe('10px')
}

export const Desktop: Story = {
  args: { recentGlyphs: ['heart', 'leaf-01'] },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement)
    await assertGlyphKindNumbers(canvasElement, true)
    await expect(root.getByRole('option')).toHaveAttribute('aria-selected', 'true')
    await expect(root.getByRole('combobox', { name: 'search glyphs' })).toHaveAttribute(
      'placeholder',
      'search 182 glyphs'
    )
    // `inheritNote`: `from ${p.inherits ?? 'health'}. set on the area.`
    await expect(canvasElement.textContent).toContain('from health. set on the area.')

    // The list, not the glass, is the scroll container — `LIST`'s own
    // `max-h-[60vh] overflow-y-auto` — so 182 cells over 8 columns overflow
    // it rather than running off the glass.
    const list = glassOf(canvasElement).querySelector<HTMLElement>('[data-part="list"]')!
    const l = getComputedStyle(list)
    await expect(l.overflowY).toBe('auto')
    await expect(l.maxHeight).not.toBe('none')
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
  },
}

/** An area target draws no inherit note — `hasInherit: isG && !gArea`. */
export const AreaTarget: Story = {
  args: { target: { isArea: true, title: 'health' }, accent: '#648F7B' },
  play: async ({ canvasElement }) => {
    const glass = glassOf(canvasElement)
    await expect(glass.querySelector('[data-part="inherit"]')).toBeNull()
    await expect(canvasElement.textContent).not.toContain('set on the area.')
  },
}

/**
 * Frame 7: "the picker's glass steps to ink, and marks keep their colours." Two
 * frames side by side (`SourcePicker.stories.tsx`'s own `ink` prop, each its own
 * portal `container` so the `.dark` class around it is the whole theme) rather
 * than one frame toggled in place, so each colour below is read off the pixel
 * the theme actually produced, not a Tailwind class name.
 *
 * `accent` is the real `markAccent('area-a')` — `var(--mn-area-a)`, sage — not a
 * literal hex: sage is the one role that is IDENTICAL in both themes
 * (`--mn-area-c`, navy, is the one that flips to mist on dark; that is its own,
 * already-decided exception, not this item's concern). A mark's own colour
 * stays exactly that CSS var, in both themes, while the glass and its rows read
 * the shared `--mn-text` tiers from `picker-chrome.ts`.
 */
export const InkTheme: Story = {
  name: 'glass + marks · ink',
  args: { target: { isArea: true, title: 'health' }, accent: markAccent('area-a') },
  render: (args) => (
    <div className="flex gap-[24px]">
      <Frame {...args} ink={false} />
      <Frame {...args} ink={true} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [light, dark] = [...canvasElement.querySelectorAll<HTMLElement>('[data-part="glass"]')]

    const lg = getComputedStyle(light)
    await expect(lg.color).toBe('rgb(27, 29, 20)')
    await expectColour(lg.borderTopColor, [255, 255, 255, 0.9])

    const dg = getComputedStyle(dark)
    await expect(dg.color).toBe('rgb(250, 249, 239)')
    await expectColour(dg.borderTopColor, [250, 249, 239, 0.09])

    // the `library` group label — the shared mono tier68, same as every other picker's `GROUP`.
    const groupLabel = (glass: HTMLElement) =>
      glass.querySelector<HTMLElement>('[data-part="section"] span')!
    await expect(getComputedStyle(groupLabel(light)).color).toBe('rgba(27, 29, 20, 0.68)')
    await expect(getComputedStyle(groupLabel(dark)).color).toBe('rgba(250, 249, 239, 0.68)')

    // the mark's own colour: the same cell, identical in both themes, at the board's sage.
    const cellColor = (glass: HTMLElement) =>
      getComputedStyle(glass.querySelector('[role="gridcell"]')!).color
    const sage = cellColor(light)
    await expect(sage).toBe('rgb(100, 143, 123)')
    await expect(cellColor(dark)).toBe(sage)
  },
}

const footNameOf = (glass: HTMLElement) =>
  glass.querySelector<HTMLElement>('[data-part="foot"] span')!.textContent

/** Search, the active cell crossing in and out of `automatic`, and picking — all by keyboard. */
export const Keyboard: Story = {
  args: { recentGlyphs: ['heart', 'leaf-01'], onPick: fn(), onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    const input = within(canvasElement).getByRole('combobox', { name: 'search glyphs' })

    // The glass focuses the search field itself on mount — a keyboard-only
    // person never clicks it, so this story never does either.
    await expect(input).toHaveFocus()

    // Typing narrows to `matches`, highlights the first hit and names it in the foot.
    await userEvent.keyboard('fl')
    const sections = glass.querySelectorAll<HTMLElement>('[data-part="section"]')
    await expect([...sections].map((s) => s.querySelector('span')!.textContent)).toEqual([
      'matches',
    ])
    const firstHit = sections[0].querySelector('[role="gridcell"]')!
    await expect(firstHit).toHaveAttribute('aria-label', 'fat-flake')
    await expect(firstHit.id).toBe(input.getAttribute('aria-activedescendant'))
    await expect(footNameOf(glass)).toBe('fat-flake')

    // → moves off the first hit onto the second.
    await userEvent.keyboard('{ArrowRight}')
    const secondHit = sections[0].querySelectorAll('[role="gridcell"]')[1]
    await expect(secondHit.id).toBe(input.getAttribute('aria-activedescendant'))
    await expect(footNameOf(glass)).toBe('flower-02')

    // Clearing the query returns to `recent`/`library`; ↑ off the first cell
    // (recent's `heart`) crosses out of the grid onto `automatic`.
    await userEvent.keyboard('{Backspace}{Backspace}')
    await expect(footNameOf(glass)).toBe('heart')
    await userEvent.keyboard('{ArrowUp}')
    const auto = glass.querySelector<HTMLElement>('[data-part="automatic"]')!
    await expect(auto.id).toBe(input.getAttribute('aria-activedescendant'))
    await expect(footNameOf(glass)).toBe('automatic')

    // ↓ crosses back onto the grid's first cell.
    await userEvent.keyboard('{ArrowDown}')
    await expect(footNameOf(glass)).toBe('heart')

    // ↵ picks the active cell.
    await userEvent.keyboard('{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith('heart')

    // esc closes with nothing picked.
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalledTimes(1)
    await expect(args.onPick).toHaveBeenCalledTimes(1)
  },
}

/**
 * A mistyped query's caret moves within the text while it still can — only at
 * the query's own start/end do ← → fall through to the grid.
 */
export const CaretInQuery: Story = {
  args: { recentGlyphs: ['heart', 'leaf-01'] },
  play: async ({ canvasElement }) => {
    const glass = glassOf(canvasElement)
    const input = within(canvasElement).getByRole<HTMLInputElement>('combobox', {
      name: 'search glyphs',
    })

    await userEvent.keyboard('fl')
    await expect(input.selectionStart).toBe(2)

    // ← from the end of "fl" moves the caret back one character, not the grid.
    await userEvent.keyboard('{ArrowLeft}')
    await expect(input.selectionStart).toBe(1)
    await expect(footNameOf(glass)).toBe('fat-flake')

    // ← again reaches the start — now it falls through and the grid stays put.
    await userEvent.keyboard('{ArrowLeft}')
    await expect(input.selectionStart).toBe(0)
    await userEvent.keyboard('{ArrowLeft}')
    await expect(input.selectionStart).toBe(0)
    await expect(footNameOf(glass)).toBe('fat-flake')

    // → from mid-query moves the caret forward, not the grid.
    await userEvent.keyboard('{ArrowRight}')
    await expect(input.selectionStart).toBe(1)
    await expect(footNameOf(glass)).toBe('fat-flake')

    // → from the end falls through to the grid's second hit.
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{ArrowRight}')
    await expect(footNameOf(glass)).toBe('flower-02')
  },
}

/** `automatic` itself can be picked, and the automatic row crosses back in from above the grid. */
export const PickAutomatic: Story = {
  args: { onPick: fn() },
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole('combobox', { name: 'search glyphs' })
    await userEvent.click(input)
    await userEvent.keyboard('{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith(null)
  },
}

/** A cell and the automatic row pick by mouse alone — `slash-row.tsx`'s own `onHover`/`onPick` shape, not a key. */
export const PickByClick: Story = {
  args: { recentGlyphs: ['heart'], onPick: fn() },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    const cell = glass.querySelector<HTMLElement>('[role="gridcell"]')!
    await expect(cell).toHaveAttribute('aria-label', 'heart')
    await userEvent.hover(cell)
    await expect(footNameOf(glass)).toBe('heart')
    await userEvent.click(cell)
    await expect(args.onPick).toHaveBeenCalledWith('heart')

    const auto = glass.querySelector<HTMLElement>('[data-part="automatic"]')!
    await userEvent.hover(auto)
    await expect(footNameOf(glass)).toBe('automatic')
    await userEvent.click(auto)
    await expect(args.onPick).toHaveBeenCalledWith(null)
  },
}

/** No hits: the DC's own no-match copy replaces the grid, and the active cell falls back to `automatic`. */
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const glass = glassOf(canvasElement)
    const input = within(canvasElement).getByRole('combobox', { name: 'search glyphs' })
    await userEvent.type(input, 'zz')
    await expect(glass.querySelector('[data-part="section"]')).toBeNull()
    await expect(canvasElement.textContent).toContain(
      'no glyph called “zz”. most shapes have a number, not a name: try a number, or browse the library.'
    )
    const auto = glass.querySelector<HTMLElement>('[data-part="automatic"]')!
    await expect(auto.id).toBe(input.getAttribute('aria-activedescendant'))
    await expect(footNameOf(glass)).toBe('automatic')
  },
}

/**
 * Pins the anchor's own `getBoundingClientRect()` to an exact viewport rect
 * via `position: fixed`, rather than wherever the story's own layout would
 * place a button — the on-screen stories below need a KNOWN anchor to prove
 * the glass's own measured BOX stays inside a known viewport.
 */
type GeometryFrameProps = Omit<GlyphPickerProps, 'anchor' | 'container' | 'side'> & {
  anchorTop: number
  anchorBottom: number
  side: 'top' | 'bottom'
}

function PinnedAnchorFrame({ anchorTop, anchorBottom, side, ...props }: GeometryFrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <div ref={setContainer}>
      <button
        ref={anchor}
        type="button"
        className="text-mn-text"
        style={{ position: 'fixed', top: anchorTop, height: anchorBottom - anchorTop, left: 40 }}
      >
        change icon
      </button>
      {container && <GlyphPicker anchor={anchor} container={container} side={side} {...props} />}
    </div>
  )
}

/**
 * The glass's own BOX — not just its content — must stay inside the viewport.
 * It keeps itself there by capping its own height to `room` (an inline
 * `maxHeight`), so the browser subtracts the real chrome and nothing predicts
 * it. Three predictions were tried first and each came out right in direction
 * and short in magnitude — hand-estimated constants (10.5px / 8.75px over),
 * then a measured chrome (3.8125px / 2.664px over) — which is what finally
 * argued for deleting the arithmetic rather than correcting it a fourth time.
 * jsdom has no layout engine, so a jest assertion here could only ever replay
 * the component's own estimate back at itself — confirmed on the retired
 * `glyph-picker-side.test.ts`, whose `renderedHeight` helper summed
 * `glyphPickerChrome(...) + glyphPickerListMaxPx(..., room − chrome, ...)`,
 * which is algebraically `chrome + (room − chrome)` = `room` — so its
 * on-screen assertion (`anchor.bottom + 4 + rendered <= viewportHeight`) held
 * BY CONSTRUCTION no matter how wrong the chrome constants were. These three
 * stories instead measure the REAL rendered glass in `test-storybook`'s
 * actual Chromium (`page.viewport` pins the iframe to 1440×900, the live
 * walk's own size — set in a `loaders` entry so it is in effect BEFORE the
 * glass's mount-time `useLayoutEffect` ever reads `window.innerHeight`, not
 * raced against a resize listener), with the anchor pinned to an exact rect
 * via `position: fixed`.
 *
 * `OnScreenBelowAnchor`'s anchor (`bottom: 282`) is the one the live walk
 * measured overshooting the viewport's bottom edge — 10.5px over with the
 * hand-estimated chrome, 3.8125px over with the measured one;
 * `OnScreenBelowAnchorArea` reuses it for an area target (no inherit row),
 * which overshot by a different constant each time (8.75px, then 2.664px) for
 * the same reason; `OnScreenAboveAnchor` opens upward (`side="top"`) from a
 * low anchor, where the same bug ran the glass's TOP edge above 0 instead
 * ("mirrored at the top when it opens upward").
 *
 * These three were each verified to FAIL against the shapes they replaced, by
 * temporarily restoring the predicted cap inside `GlyphPicker.tsx` and running
 * `npm run test-storybook -- GlyphPicker`: all three failed
 * (`OnScreenBelowAnchor` and `OnScreenBelowAnchorArea` on the `rect.bottom`
 * and foot assertions, `OnScreenAboveAnchor` on `rect.top`), then the
 * production file was put back. They are the only reason either residual was
 * ever caught: the retired jest helper was green through both of them.
 */
export const OnScreenBelowAnchor: Story = {
  name: 'on screen · opens below a low anchor',
  args: { recentGlyphs: ['heart', 'leaf-01'] },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      return { prevViewport }
    },
  ],
  render: (args) => <PinnedAnchorFrame {...args} anchorTop={254} anchorBottom={282} side="bottom" />,
  play: async ({ canvasElement, loaded }) => {
    try {
      const glass = glassOf(canvasElement)
      await expect(glass.getBoundingClientRect().bottom).toBeLessThanOrEqual(900 + SUBPIXEL_TOLERANCE_PX)
      const foot = glass.querySelector<HTMLElement>('[data-part="foot"]')!
      await expect(foot.getBoundingClientRect().bottom).toBeLessThanOrEqual(900 + SUBPIXEL_TOLERANCE_PX)
    } finally {
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/** Same anchor as `OnScreenBelowAnchor`, an area target — no inherit row, a different chrome estimate to get wrong. */
export const OnScreenBelowAnchorArea: Story = {
  name: 'on screen · opens below, area target',
  args: {
    target: { isArea: true, title: 'health' },
    accent: '#648F7B',
    recentGlyphs: ['heart', 'leaf-01'],
  },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      return { prevViewport }
    },
  ],
  render: (args) => <PinnedAnchorFrame {...args} anchorTop={254} anchorBottom={282} side="bottom" />,
  play: async ({ canvasElement, loaded }) => {
    try {
      const glass = glassOf(canvasElement)
      await expect(glass.getBoundingClientRect().bottom).toBeLessThanOrEqual(900 + SUBPIXEL_TOLERANCE_PX)
      const foot = glass.querySelector<HTMLElement>('[data-part="foot"]')!
      await expect(foot.getBoundingClientRect().bottom).toBeLessThanOrEqual(900 + SUBPIXEL_TOLERANCE_PX)
    } finally {
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}

/** A low anchor opening upward (`side="top"`) — the same bug, mirrored at the glass's TOP edge. */
export const OnScreenAboveAnchor: Story = {
  name: 'on screen · opens above a low anchor',
  args: { recentGlyphs: ['heart', 'leaf-01'] },
  loaders: [
    async () => {
      const prevViewport = { width: window.innerWidth, height: window.innerHeight }
      await page.viewport(1440, 900)
      return { prevViewport }
    },
  ],
  render: (args) => <PinnedAnchorFrame {...args} anchorTop={600} anchorBottom={628} side="top" />,
  play: async ({ canvasElement, loaded }) => {
    try {
      const glass = glassOf(canvasElement)
      await expect(glass.getBoundingClientRect().top).toBeGreaterThanOrEqual(0 - SUBPIXEL_TOLERANCE_PX)
      const head = glass.querySelector<HTMLElement>('[data-part="head"]')!
      await expect(head.getBoundingClientRect().top).toBeGreaterThanOrEqual(0 - SUBPIXEL_TOLERANCE_PX)
    } finally {
      const { width, height } = loaded.prevViewport as { width: number; height: number }
      await page.viewport(width, height)
    }
  },
}
