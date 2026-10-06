import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor } from 'storybook/test'

import { PondCommand, type PondCommandProps } from './PondCommand'
import { isPaletteChord } from '@/lib/shell-commands'
import { PALETTE_FOOT, PALETTE_FOOT_MOBILE } from '@/components/molecules/palette-entries'
import {
  PALETTE_ITEMS,
  PALETTE_SUGGESTED,
  paletteChrome,
  paletteItemsFor,
} from '@/__tests__/helpers/palette-fixture'

/**
 * The command palette — `PondCommand` (`Pond 02` 2g, `Pond 05` 5al): the
 * breadcrumb at rest, grown in place by ⌘K or a click into `PondPicker
 * kind="palette"`. Both themes. Every number asserted below is a literal from
 * `PondCommand.dc.html` (rest and motion) or `PondPicker.dc.html`'s palette branch
 * (the rows), read back off REAL computed styles.
 *
 * The rows are `helpers/palette-fixture` — the one fixture the jest suite reads
 * too, and not an export of this file (Storybook would list it as a story).
 * The live records and ponds come from the shell (`ShellCommands`); here a `pond`
 * row and the records for `cab` and `adobe` are the board's frames. `suggested`
 * is likewise a fixture: the shell passes none until it can infer them (#285).
 */

const PAPER = {
  ink: 'rgb(27, 29, 20)',
  tier80: 'rgba(27, 29, 20, 0.8)',
  tier68: 'rgba(27, 29, 20, 0.68)',
  // `.mn-glass`, light — byte-for-byte the board's recipe.
  glassBorder: 'rgba(255, 255, 255, 0.9)',
}
const INK = {
  ink: 'rgb(250, 249, 239)',
  tier80: 'rgba(250, 249, 239, 0.8)',
  tier68: 'rgba(250, 249, 239, 0.68)',
  // `.mn-glass`, dark — one floating-glass recipe (ADR 0004 ruling 11). `PondCommand`
  // draws no dark border; `PondComposer`'s ink glass is the board that writes it.
  glassBorder: 'rgba(250, 249, 239, 0.09)',
}
type Palette = typeof PAPER

/** Open, against `PondPicker`'s `mob` branch below `md`. */
const DESKTOP = {
  width: 560,
  head: 13.5,
  rowPad: '9px 12px',
  row: 13.5,
  sub: 12.5,
  note: 12,
  foot: PALETTE_FOOT,
}
const MOBILE = {
  width: 360,
  head: 16,
  rowPad: '13px 12px',
  row: 15,
  sub: 13,
  note: 13,
  foot: PALETTE_FOOT_MOBILE,
}
type Metrics = typeof DESKTOP

/** The board's default path: `life › professional › standups`, professional's mark. */
const PATH = { glyph: 'ramp', trail: ['life', 'professional'], current: 'standups' }

const MONO = /PP Neue Montreal Mono/
const px = (v: string) => parseFloat(v)
const tracking = (v: string) => (v === 'normal' ? 0 : px(v))

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  if (color === 'rgba(0, 0, 0, 0)') return 0
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

// ── Frame ──────────────────────────────────────────────────────────────────────

type FrameProps = Partial<PondCommandProps> & {
  ink?: boolean
  /** Holds it open whatever closes it, so a test can count the requests. */
  pinned?: boolean
}

/**
 * A themed page with the command at its top centre, as the shell places it. The
 * frame owns `open` the way `ShellCommands` does, including ⌘K (Ctrl+K off Apple).
 */
function Frame({
  ink,
  pinned,
  open: initiallyOpen = false,
  onOpenChange,
  items = PALETTE_ITEMS,
  onSelect = fn(),
  ...props
}: FrameProps) {
  const [open, setOpen] = useState(initiallyOpen)
  const handleOpenChange = (next: boolean) => {
    onOpenChange?.(next)
    if (!pinned) setOpen(next)
  }

  useEffect(() => {
    if (pinned) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPaletteChord(e)) return
      e.preventDefault()
      setOpen((wasOpen) => !wasOpen)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pinned])

  return (
    <div
      data-theme={ink ? 'ink' : 'paper'}
      className={`${ink ? 'dark bg-raw-ink' : 'bg-raw-paper'} min-h-screen w-full pt-5`}
    >
      <PondCommand
        className="relative mx-auto w-max"
        path={PATH}
        open={open}
        onOpenChange={handleOpenChange}
        items={items}
        onSelect={onSelect}
        {...props}
      />
    </div>
  )
}

/**
 * Below Tailwind's `md` (768) the palette takes `PondPicker`'s phone sizes, so a
 * story that left the width to the Storybook pane would draw a desktop frame at
 * phone type in any pane narrower than 768. Every story names its screen: the
 * desktop frames at 768, the narrowest desktop (the open 560 still fits a narrow
 * pane), and the `· mobile` frames at an iPhone's 390.
 */
const VIEWPORTS = {
  desktop: { name: 'desktop (md, 768)', styles: { width: '768px', height: '900px' } },
  phone: { name: 'phone', styles: { width: '390px', height: '844px' } },
}

const meta = {
  title: 'Organisms/pickers/2g · the command palette',
  component: Frame,
  parameters: { layout: 'fullscreen', viewport: { options: VIEWPORTS } },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: {},
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

// ── Assertions ─────────────────────────────────────────────────────────────────

const boxOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-part="command"]')!
const part = (root: HTMLElement, name: string) =>
  boxOf(root).querySelector<HTMLElement>(`[data-part="${name}"]`)
const labels = (root: HTMLElement) =>
  [...boxOf(root).querySelectorAll('[role="option"] [data-part="label"]')].map(
    (l) => l.textContent
  )
const groups = (root: HTMLElement) =>
  [...boxOf(root).querySelectorAll('[data-part="group"]')].map((g) => g.textContent)

/** The one box, the same in every state: glass, radius, and the controls that never move. */
async function assertBox(root: HTMLElement, p: Palette) {
  const box = boxOf(root)
  const b = getComputedStyle(box)
  await expect(b.boxSizing).toBe('border-box')
  // The board's `overflow: hidden`, as `clip`: it paints the same, but the box can
  // never be scrolled — see `assertOpening`.
  await expect(b.overflow).toBe('clip')
  await expect(b.borderTopLeftRadius).toBe('20px')
  await expect(b.color).toBe(p.ink)
  await expect(b.borderTopWidth).toBe('1px')
  await expect(b.borderTopColor).toBe(p.glassBorder)
  await expect(b.backgroundImage).toMatch(/linear-gradient\(160deg/)
  await expect(b.backdropFilter).toBe('blur(24px) saturate(1.3)')
  // No modal, no scrim, nothing dims: nothing in the frame is fixed over the page.
  await expect(root.querySelector('[role="dialog"]')).toBeNull()
  await expect(root.querySelector('[aria-modal]')).toBeNull()
  for (const el of root.querySelectorAll('*'))
    await expect(getComputedStyle(el).position).not.toBe('fixed')

  const glyph = getComputedStyle(part(root, 'glyph')!)
  await expect([glyph.left, glyph.top]).toEqual(['14px', '14px'])
  const icon = part(root, 'glyph')!.querySelector<HTMLElement>('[data-icon]')!
  await expect(icon.getAttribute('data-icon')).toBe('ramp')
  await expect(getComputedStyle(icon).width).toBe('12px')

  const mode = getComputedStyle(part(root, 'mode')!)
  await expect([mode.width, mode.height, mode.right, mode.top]).toEqual([
    '22px',
    '22px',
    '56px',
    '9px',
  ])
  await expect(mode.color).toBe(p.tier68)
  await expect(part(root, 'mode')!.querySelector('svg')!.getAttribute('stroke-width')).toBe('1.4')

  const chip = getComputedStyle(part(root, 'chip')!)
  await expect([chip.width, chip.height, chip.right, chip.top]).toEqual([
    '38px',
    '22px',
    '8px',
    '9px',
  ])
  await expect(alphaOf(chip.backgroundColor)).toBeCloseTo(0.07, 2)
  await expect(chip.color).toBe(p.tier68)
  await expect(chip.fontFamily).not.toMatch(MONO)
  await expect(chip.fontWeight).toBe('500')
  await expect(px(chip.fontSize)).toBe(11)
  await expect(tracking(chip.letterSpacing)).toBeCloseTo(0.44, 2)
}

/** At rest: the breadcrumb — 40 tall, as wide as its path + 124, nothing of the list drawn. */
async function assertResting(root: HTMLElement, p: Palette) {
  await assertBox(root, p)
  const box = boxOf(root)
  await expect(box.getAttribute('data-state')).toBe('rest')
  const path = part(root, 'path')!
  await expect(box.offsetHeight).toBe(40)
  await expect(box.offsetWidth).toBe(path.offsetWidth + 124)
  const s = getComputedStyle(path)
  await expect([s.left, s.height, s.columnGap]).toEqual(['36px', '38px', '10px'])
  await expect(px(s.fontSize)).toBe(11)
  await expect(tracking(s.letterSpacing)).toBeCloseTo(0.44, 2)
  await expect(s.opacity).toBe('1')
  const [life, , professional, , current, rule] = [...path.children] as HTMLElement[]
  await expect([life.textContent, professional.textContent, current.textContent]).toEqual([
    'life',
    'professional',
    'standups',
  ])
  await expect(getComputedStyle(life).color).toBe(p.tier68)
  await expect(getComputedStyle(path.children[1]).color).toBe(p.tier80)
  await expect(getComputedStyle(current).color).toBe(p.ink)
  await expect(getComputedStyle(current).fontWeight).toBe('500')
  await expect([rule.offsetWidth, rule.offsetHeight]).toEqual([1, 14])
  await expect(alphaOf(getComputedStyle(rule).backgroundColor)).toBeCloseTo(0.09, 2)

  await expect(part(root, 'chip')!.textContent).toBe('⌘K')
  await expect(box.querySelector('input')).toBeNull()
  await expect(box.querySelector('[role="listbox"]')).toBeNull()
  await expect(part(root, 'opener')!.getAttribute('aria-expanded')).toBe('false')
}

/** Open: 560 (360 below md), 40 + the body, the input in the path's place, the list under a hairline. */
async function assertChrome(root: HTMLElement, p: Palette, m: Metrics = DESKTOP) {
  await expect(window.innerWidth >= 768).toBe(m === DESKTOP)
  await assertBox(root, p)
  const box = boxOf(root)
  await expect(box.getAttribute('data-state')).toBe('open')
  await expect(box.offsetWidth).toBe(m.width)
  const body = part(root, 'body')!
  await expect(box.offsetHeight).toBe(40 + body.offsetHeight)
  // The board sets no line-height anywhere: every layer inherits `normal`, which
  // is what makes a row 18 + one line (34.5 at 13.5px), not preflight's 1.5.
  for (const el of box.querySelectorAll<HTMLElement>('*')) {
    await expect(getComputedStyle(el).lineHeight).toBe('normal')
  }
  await expect(part(root, 'chip')!.textContent).toBe('esc')
  await expect(getComputedStyle(part(root, 'path')!).opacity).toBe('0')

  const head = getComputedStyle(part(root, 'head')!)
  await expect([head.left, head.right, head.height]).toEqual(['36px', '88px', '38px'])
  const input = box.querySelector<HTMLInputElement>('input')!
  const i = getComputedStyle(input)
  await expect(i.fontFamily).not.toMatch(MONO)
  await expect(i.fontWeight).toBe('500')
  await expect(px(i.fontSize)).toBe(m.head)
  await expect(i.color).toBe(p.ink)
  await expect(input.getAttribute('role')).toBe('combobox')
  const list = box.querySelector<HTMLElement>('[role="listbox"]')!
  await expect(input.getAttribute('aria-controls')).toBe(list.id)
  await expect(input.getAttribute('aria-expanded')).toBe('true')
  const sel = box.querySelector<HTMLElement>('[aria-selected="true"]')
  await expect(input.getAttribute('aria-activedescendant')).toBe(sel ? sel.id : null)
  // A row is an `option`, never a button — a button here would take focus off the
  // input and the typing would stop.
  for (const o of box.querySelectorAll('[role="option"]')) await expect(o.tagName).toBe('DIV')

  const b = getComputedStyle(body)
  await expect([b.top, b.left]).toEqual(['39px', '-1px'])
  await expect(body.offsetWidth).toBe(m.width)
  const hairline = getComputedStyle(body.firstElementChild!)
  await expect([hairline.height, hairline.marginLeft, hairline.marginRight]).toEqual([
    '1px',
    '10px',
    '10px',
  ])
  await expect(alphaOf(hairline.backgroundColor)).toBeCloseTo(0.09, 2)
  const l = getComputedStyle(list)
  await expect(l.padding).toBe('6px 10px 0px')
  await expect(l.rowGap).toBe('2px')

  for (const group of box.querySelectorAll<HTMLElement>('[data-part="group"]')) {
    const s = getComputedStyle(group)
    await expect(s.padding).toBe('8px 12px 4px')
    await expect(s.fontFamily).not.toMatch(MONO)
    await expect(s.fontWeight).toBe('500')
    await expect(px(s.fontSize)).toBe(10.5)
    await expect(tracking(s.letterSpacing)).toBeCloseTo(1.05, 2)
    await expect(s.textTransform).toBe('uppercase')
    await expect(s.color).toBe(p.tier68)
  }

  for (const row of box.querySelectorAll<HTMLElement>('[role="option"]')) {
    const s = getComputedStyle(row)
    const kind = row.getAttribute('data-kind')
    const selected = row.getAttribute('aria-selected') === 'true'
    await expect(s.display).toBe('flex')
    await expect(s.alignItems).toBe('center')
    await expect(s.columnGap).toBe('10px')
    await expect(s.padding).toBe(m.rowPad)
    await expect(s.borderTopLeftRadius).toBe('14px')
    // SANS — ADR 0004 §4 — at the board's 13.5 and tracking 0.
    await expect(s.fontFamily).not.toMatch(MONO)
    await expect(px(s.fontSize)).toBe(m.row)
    await expect(tracking(s.letterSpacing)).toBe(0)
    await expect(s.color).toBe(kind === 'action' ? p.tier80 : p.ink)
    await expect(alphaOf(s.backgroundColor)).toBeCloseTo(selected ? 0.07 : 0, 2)
    // Settled: every row has risen fully in.
    await expect(s.opacity).toBe('1')

    const label = row.querySelector<HTMLElement>('[data-part="label"]')!
    const glyph = row.querySelector<HTMLElement>('[data-icon]')
    await expect(getComputedStyle(label).fontWeight).toBe(glyph ? '500' : '400')
    await expect(getComputedStyle(label).whiteSpace).toBe('nowrap')
    await expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
    if (glyph) await expect(getComputedStyle(glyph).width).toBe('13px')
    if (kind === 'record' || kind === 'database') {
      const svg = row.querySelector('svg')!
      await expect(svg.getAttribute('width')).toBe('13')
      await expect(svg.getAttribute('stroke-width')).toBe('1.4')
      await expect(getComputedStyle(row.querySelector('[data-part="icon"]')!).color).toBe(p.tier80)
    }
    if (kind === 'action') {
      const mark = getComputedStyle(row.querySelector('[data-part="act-mark"]')!)
      await expect(mark.fontFamily).toMatch(MONO)
      await expect(px(mark.fontSize)).toBe(12.5)
    }
    const sub = row.querySelector<HTMLElement>('[data-part="sub"]')
    if (sub) {
      const ss = getComputedStyle(sub)
      await expect(px(ss.fontSize)).toBe(m.sub)
      await expect(ss.color).toBe(p.tier68)
      await expect(ss.whiteSpace).toBe('nowrap')
      // Inline: the sub sits beside the name, centred on the same line.
      const sb = sub.getBoundingClientRect()
      const lb = label.getBoundingClientRect()
      await expect(sb.left).toBeGreaterThanOrEqual(lb.right)
      await expect(Math.abs(sb.top + sb.height / 2 - (lb.top + lb.height / 2))).toBeLessThan(1)
    }
    const hint = row.querySelector<HTMLElement>('[data-part="hint"]')
    if (hint) {
      await expect(selected).toBe(false)
      await expect(getComputedStyle(hint).fontFamily).toMatch(MONO)
      await expect(px(getComputedStyle(hint).fontSize)).toBe(10.5)
    }
    const enter = row.querySelector<HTMLElement>('[data-part="enter"]')
    await expect(enter !== null).toBe(selected)
    if (enter) {
      await expect(getComputedStyle(enter).fontFamily).toMatch(MONO)
      await expect(px(getComputedStyle(enter).fontSize)).toBe(10.5)
      await expect(getComputedStyle(enter).color).toBe(p.tier80)
    }
  }

  const foot = part(root, 'foot')!
  const f = getComputedStyle(foot)
  const shown = [...foot.children]
    .filter((c) => getComputedStyle(c).display !== 'none')
    .map((c) => c.textContent)
  await expect(shown).toEqual([...m.foot])
  await expect(f.flexWrap).toBe('wrap')
  await expect(f.columnGap).toBe('14px')
  await expect(f.padding).toBe('10px 22px 14px')
  await expect(f.marginTop).toBe('6px')
  await expect(f.borderTopWidth).toBe('1px')
  await expect(alphaOf(f.borderTopColor)).toBeCloseTo(0.09, 2)
  await expect(f.fontFamily).toMatch(MONO)
  await expect(px(f.fontSize)).toBe(10.5)
  await expect(f.color).toBe(p.tier68)
  await expect(f.opacity).toBe('1')

  // The chrome is lowercase — Pond's words. A page's title is content and keeps
  // its case (ADR 0004 §4), so the rows' names are not in this string.
  await expect(paletteChrome(box)).not.toMatch(/[A-Z]/)
}

async function assertHit(root: HTMLElement, label: string, hit: string) {
  const row = [...boxOf(root).querySelectorAll<HTMLElement>('[role="option"]')].find(
    (r) => r.querySelector('[data-part="label"]')!.textContent === label
  )!
  const el = row.querySelector<HTMLElement>('[data-part="hit"]')!
  await expect(el.textContent).toBe(hit)
  const s = getComputedStyle(el)
  await expect(s.textDecorationLine).toBe('underline')
  await expect(s.textUnderlineOffset).toBe('3px')
  await expect(s.textDecorationThickness).toBe('1px')
}

// ── resting · opening — `PondCommand` ──────────────────────────────────────────

/** The breadcrumb is the palette at rest: area glyph, path, ⌘K. */
export const Resting: Story = {
  name: 'resting',
  play: async ({ canvasElement }) => assertResting(canvasElement, PAPER),
}
export const RestingInk: Story = {
  name: 'resting · ink',
  args: { ink: true },
  play: async ({ canvasElement }) => assertResting(canvasElement, INK),
}

/**
 * Mid-way, t = .5 (140ms of 280): the same box wider and growing down, the path
 * given way to the input, the rows still arriving in order. No modal, no scrim.
 */
async function assertOpening(root: HTMLElement, p: Palette) {
  await assertBox(root, p)
  const box = boxOf(root)
  const restW = part(root, 'path')!.offsetWidth + 124
  await expect(box.offsetWidth).toBeGreaterThan(restW)
  await expect(box.offsetWidth).toBeLessThan(560)
  await expect(box.offsetHeight).toBeLessThan(40 + part(root, 'body')!.offsetHeight)
  // Mid-growth the box is shorter than what it holds. It must never become a
  // scroll container, or moving the selection (`scrollIntoView`) scrolls the
  // whole inside up under the top edge.
  await expect(getComputedStyle(box).overflow).toBe('clip')
  box.scrollTop = 20
  await expect(box.scrollTop).toBe(0)
  await expect(part(root, 'chip')!.textContent).toBe('esc')
  await expect(getComputedStyle(part(root, 'path')!).opacity).toBe('0')
  await expect(getComputedStyle(part(root, 'head')!).opacity).toBe('1')
  const rows = [...box.querySelectorAll<HTMLElement>('[role="listbox"] > *')].map((r) =>
    parseFloat(getComputedStyle(r).opacity)
  )
  await expect(rows[0]).toBe(1)
  await expect(rows[rows.length - 1]).toBeLessThan(1)
  for (let i = 1; i < rows.length; i++) await expect(rows[i]).toBeLessThanOrEqual(rows[i - 1])
  const foot = parseFloat(getComputedStyle(part(root, 'foot')!).opacity)
  await expect(foot).toBeGreaterThan(0)
  await expect(foot).toBeLessThan(1)
}

export const Opening: Story = {
  name: 'opening',
  args: { open: true, at: 0.5, suggested: PALETTE_SUGGESTED },
  play: async ({ canvasElement }) => assertOpening(canvasElement, PAPER),
}
export const OpeningInk: Story = {
  name: 'opening · ink',
  args: { open: true, at: 0.5, suggested: PALETTE_SUGGESTED, ink: true },
  play: async ({ canvasElement }) => assertOpening(canvasElement, INK),
}

// ── opened — `PondPicker kind="palette"` ───────────────────────────────────────

async function assertOpened(root: HTMLElement, p: Palette, suggested: boolean, m = DESKTOP) {
  await assertChrome(root, p, m)
  const input = boxOf(root).querySelector<HTMLInputElement>('input')!
  await expect(input.placeholder).toBe('jump to a page, or > for actions')
  await expect(document.activeElement).toBe(input)
  await expect(groups(root)).toEqual(suggested ? ['recent', 'suggested'] : ['recent'])
  await expect(labels(root)).toEqual([
    'kitchen renovation',
    'budget',
    'journal',
    ...(suggested ? ['chase the cabinet quote', 'log a workout'] : []),
  ])
}

/** Nothing typed, nothing inferred: the last three pages under `recent`, and no `suggested` faked (#285). */
export const Opened: Story = {
  tags: ['!dev'],
  args: { open: true },
  play: async ({ canvasElement }) => assertOpened(canvasElement, PAPER, false),
}

/** The board's `opened` frame in full: `recent`, then the two `suggested` actions the host supplied. */
export const OpenedSuggested: Story = {
  name: 'opened',
  args: { open: true, suggested: PALETTE_SUGGESTED },
  play: async ({ canvasElement }) => assertOpened(canvasElement, PAPER, true),
}
export const OpenedSuggestedInk: Story = {
  name: 'opened · ink',
  args: { open: true, suggested: PALETTE_SUGGESTED, ink: true },
  play: async ({ canvasElement }) => assertOpened(canvasElement, INK, true),
}

// ── typing ─────────────────────────────────────────────────────────────────────

async function assertTyping(root: HTMLElement, p: Palette, m: Metrics = DESKTOP) {
  await assertChrome(root, p, m)
  await expect(groups(root)).toEqual(['pages', 'records', 'actions'])
  await expect(labels(root)).toEqual([
    'cabinet plan',
    'cabinet quote',
    'chase the cabinet quote',
    'ask pond about “cab”',
  ])
  await assertHit(root, 'chase the cabinet quote', 'cab')
}

/** `cab`: pages, then records, then actions; the hit underlined, never washed. */
export const Typing: Story = {
  name: 'typing',
  args: { open: true, defaultQuery: 'cab', items: paletteItemsFor('cab') },
  play: async ({ canvasElement }) => assertTyping(canvasElement, PAPER),
}
export const TypingInk: Story = {
  name: 'typing · ink',
  args: { open: true, defaultQuery: 'cab', items: paletteItemsFor('cab'), ink: true },
  play: async ({ canvasElement }) => assertTyping(canvasElement, INK),
}

// ── actions ────────────────────────────────────────────────────────────────────

async function assertActions(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  await expect(groups(root)).toEqual([])
  await expect(labels(root)).toEqual(['log a workout', 'log a meal', 'log sleep'])
  await assertHit(root, 'log a meal', 'log')
}

/** `> log`: the leading `>` drops pages and records. */
export const Actions: Story = {
  name: 'actions',
  args: { open: true, defaultQuery: '> log' },
  play: async ({ canvasElement }) => assertActions(canvasElement, PAPER),
}
export const ActionsInk: Story = {
  name: 'actions · ink',
  args: { open: true, defaultQuery: '> log', ink: true },
  play: async ({ canvasElement }) => assertActions(canvasElement, INK),
}

// ── record ─────────────────────────────────────────────────────────────────────

async function assertRecord(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  await expect(groups(root)).toEqual(['records', 'actions'])
  const selected = boxOf(root).querySelector<HTMLElement>('[aria-selected="true"]')!
  await expect(selected.getAttribute('data-kind')).toBe('record')
  await expect(selected.querySelector('[data-part="sub"]')!.textContent).toBe(
    'subscriptions · renews 28 sep'
  )
  await assertHit(root, 'adobe creative cloud', 'adobe')
}

/** `adobe`: a record is first class, the matched field beside its name. */
export const Record: Story = {
  name: 'record',
  args: { open: true, defaultQuery: 'adobe', items: paletteItemsFor('adobe') },
  play: async ({ canvasElement }) => assertRecord(canvasElement, PAPER),
}
export const RecordInk: Story = {
  name: 'record · ink',
  args: { open: true, defaultQuery: 'adobe', items: paletteItemsFor('adobe'), ink: true },
  play: async ({ canvasElement }) => assertRecord(canvasElement, INK),
}

// ── empty ──────────────────────────────────────────────────────────────────────

async function assertEmpty(root: HTMLElement, p: Palette, m: Metrics = DESKTOP) {
  await assertChrome(root, p, m)
  const note = part(root, 'note')!
  await expect(note.textContent).toBe('no page or record called “cabnet”')
  const s = getComputedStyle(note)
  await expect(s.padding).toBe('10px 12px')
  await expect(s.fontFamily).toMatch(MONO)
  await expect(px(s.fontSize)).toBe(m.note)
  await expect(s.color).toBe(p.tier80)
  await expect(groups(root)).toEqual(['did you mean'])
  await expect(labels(root)).toEqual([
    'ask pond about “cabnet”',
    'new page “cabnet” under life',
    'cabinet plan',
  ])
  await expect(root.querySelector('[aria-selected="true"] [data-part="label"]')!.textContent).toBe(
    'ask pond about “cabnet”'
  )
}

/** `cabnet`: no dead end — the note, ask pond, make the page, a close spelling. */
export const Empty: Story = {
  name: 'empty',
  args: { open: true, defaultQuery: 'cabnet' },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, PAPER),
}
export const EmptyInk: Story = {
  name: 'empty · ink',
  args: { open: true, defaultQuery: 'cabnet', ink: true },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, INK),
}

// ── scoped ─────────────────────────────────────────────────────────────────────

const MONEY = { id: 'money', label: 'money' }

async function assertScoped(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const chip = part(root, 'scope')!
  await expect(chip.textContent).toBe('in money:')
  const s = getComputedStyle(chip)
  await expect(s.padding).toBe('1px 6px')
  await expect(s.borderTopLeftRadius).toBe('6px')
  await expect(alphaOf(s.backgroundColor)).toBeCloseTo(0.07, 2)
  await expect(s.color).toBe(p.tier80)
  await expect(boxOf(root).querySelector<HTMLInputElement>('input')!.placeholder).toBe('')
  await expect(groups(root)).toEqual([])
  // `Savings` keeps its case: a page's title is content, only the chrome is lowercase.
  await expect(labels(root)).toEqual(['budget', 'subscriptions', 'Savings', 'transactions'])
  await expect(
    [...boxOf(root).querySelectorAll('[data-part="sub"]')].map((x) => x.textContent)
  ).toEqual(['page', 'page', 'page', 'database'])
}

/** The rail's selected page and its children, the kind beside each name. */
export const Scoped: Story = {
  name: 'scoped',
  args: { open: true, scope: MONEY },
  play: async ({ canvasElement }) => assertScoped(canvasElement, PAPER),
}
export const ScopedInk: Story = {
  name: 'scoped · ink',
  args: { open: true, scope: MONEY, ink: true },
  play: async ({ canvasElement }) => assertScoped(canvasElement, INK),
}

// ── ponds ──────────────────────────────────────────────────────────────────────

async function assertPonds(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  await expect(groups(root)).toEqual(['ponds', 'pages in life', 'actions'])
  await expect(labels(root)).toEqual([
    'make noise',
    'make this a page',
    'new pond “make”',
    'ask pond about “make”',
  ])
  const pond = boxOf(root).querySelector<HTMLElement>('[data-kind="pond"]')!
  await expect(pond.getAttribute('aria-selected')).toBe('true')
  await expect(pond.querySelector('[data-part="sub"]')!.textContent).toBe('pond · switch')
  await assertHit(root, 'make noise', 'make')
}

/** `make`: a pond above the pages (6m), and `new pond “make”` among the actions. */
export const Ponds: Story = {
  name: 'ponds',
  args: { open: true, defaultQuery: 'make' },
  play: async ({ canvasElement }) => assertPonds(canvasElement, PAPER),
}
export const PondsInk: Story = {
  name: 'ponds · ink',
  args: { open: true, defaultQuery: 'make', ink: true },
  play: async ({ canvasElement }) => assertPonds(canvasElement, INK),
}

// ── mobile — `PondPicker`'s `mob` branch ───────────────────────────────────────

const onPhone = { viewport: { value: 'phone', isRotated: false } }

async function assertPhone() {
  await expect(window.innerWidth).toBeLessThan(768)
}

/** Opens to 360, input 16, rows `13px 12px` at 15; the foot keeps `↵ open` and `> actions only`. */
export const MobileOpened: Story = {
  name: 'opened · mobile',
  args: { open: true },
  globals: onPhone,
  play: async ({ canvasElement }) => {
    await assertPhone()
    await assertOpened(canvasElement, PAPER, false, MOBILE)
  },
}

/** `cab`: the sub-line is 13 on a phone, the hit still underlined. */
export const MobileTyping: Story = {
  name: 'typing · mobile',
  args: { open: true, defaultQuery: 'cab', items: paletteItemsFor('cab') },
  globals: onPhone,
  play: async ({ canvasElement }) => {
    await assertPhone()
    await assertTyping(canvasElement, PAPER, MOBILE)
  },
}

/** `cabnet`: the note is 13 on a phone. */
export const MobileEmpty: Story = {
  name: 'empty · mobile',
  args: { open: true, defaultQuery: 'cabnet' },
  globals: onPhone,
  play: async ({ canvasElement }) => {
    await assertPhone()
    await assertEmpty(canvasElement, PAPER, MOBILE)
  },
}

// ── the morph, for real ────────────────────────────────────────────────────────

/** Pressing both chords is one toggle: each platform owns exactly one of them. */
const pressChord = () => userEvent.keyboard('{Meta>}k{/Meta}{Control>}k{/Control}')
const settledOpen = (root: HTMLElement) =>
  waitFor(() => expect(boxOf(root).offsetWidth).toBe(560))
const settledRest = (root: HTMLElement) =>
  waitFor(() => expect(boxOf(root).querySelector('[role="listbox"]')).toBeNull())

/**
 * A click on the breadcrumb grows it in place, the caret landing in the input;
 * esc, ⌘K and a press outside each shrink it back, and ⌘K grows it again. The
 * mode toggle switches light/dark and never opens it.
 */
export const Morph: Story = {
  tags: ['!dev'],
  play: async ({ canvasElement }) => {
    const box = boxOf(canvasElement)
    const restW = box.offsetWidth

    await userEvent.click(part(canvasElement, 'opener')!)
    await expect(box.getAttribute('data-state')).toBe('open')
    await waitFor(() => expect(document.activeElement).toBe(box.querySelector('input')))
    await settledOpen(canvasElement)

    await userEvent.keyboard('{Escape}')
    await settledRest(canvasElement)
    await expect(box.offsetWidth).toBe(restW)
    await expect(box.offsetHeight).toBe(40)
    await expect(document.activeElement).not.toBe(box.querySelector('input'))

    await pressChord()
    await waitFor(() => expect(document.activeElement).toBe(box.querySelector('input')))
    await settledOpen(canvasElement)
    await pressChord()
    await settledRest(canvasElement)

    await pressChord()
    await settledOpen(canvasElement)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await settledRest(canvasElement)

    const html = document.documentElement
    const wasDark = html.classList.contains('dark')
    await userEvent.click(part(canvasElement, 'mode')!)
    await expect(html.classList.contains('dark')).toBe(!wasDark)
    await expect(box.getAttribute('data-state')).toBe('rest')
    await userEvent.click(part(canvasElement, 'mode')!)
    await expect(html.classList.contains('dark')).toBe(wasDark)
  },
}

// ── the keys ───────────────────────────────────────────────────────────────────

/** ↓↓ then ↵ opens the third row; ⌫ on an empty line clears the scope; esc asks to close. */
export const Keys: Story = {
  tags: ['!dev'],
  args: { open: true, pinned: true, scope: MONEY, onSelect: fn(), onOpenChange: fn() },
  play: async ({ canvasElement, args }) => {
    await expect(part(canvasElement, 'scope')).not.toBeNull()
    await userEvent.keyboard('{Backspace}')
    await expect(part(canvasElement, 'scope')).toBeNull()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'journal' }))
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

// ── dismissal, and the controls in the box ─────────────────────────────────────

/**
 * Two ways out, and two that are not: esc and a press anywhere outside the box
 * close; a press INSIDE (on the input) must not, or it shuts the moment someone
 * clicks into the field — and ⌘K is not this element's to handle, the shell owns
 * that key (KAN-57). Tab off the input reaches the mode toggle, then `esc`, and
 * both wear the house mist ring, asserted as the painted outline.
 */
export const Dismissal: Story = {
  tags: ['!dev'],
  args: { open: true, pinned: true, onOpenChange: fn() },
  play: async ({ canvasElement, args }) => {
    const box = boxOf(canvasElement)
    const input = box.querySelector<HTMLInputElement>('input')!

    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await expect(args.onOpenChange).not.toHaveBeenCalled()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await expect(args.onOpenChange).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledTimes(2)
    await pressChord()
    await expect(args.onOpenChange).toHaveBeenCalledTimes(2)

    input.focus()
    await userEvent.tab()
    await expect(part(canvasElement, 'mode')).toHaveFocus()
    await userEvent.tab()
    const esc = part(canvasElement, 'chip')!
    await expect(esc.tagName).toBe('BUTTON')
    await expect(esc.textContent).toBe('esc')
    await expect(esc).toHaveFocus()
    const f = getComputedStyle(esc)
    // `PondControl`'s focus outline: 2px solid mist, offset 2 — one owner, never flips.
    await expect(f.outlineStyle).toBe('solid')
    await expect(f.outlineWidth).toBe('2px')
    await expect(f.outlineOffset).toBe('2px')
    await expect(f.outlineColor).toBe('rgb(165, 200, 209)')

    await userEvent.click(esc)
    await expect(args.onOpenChange).toHaveBeenCalledTimes(3)
  },
}

// ── the pointer, and typing for real ──────────────────────────────────────────

/**
 * The mouse path, and a query typed a letter at a time: the list narrows live,
 * the hit is split on the row that matched, hovering a row selects it (and the
 * input says so), and a click opens it.
 */
export const Pointer: Story = {
  tags: ['!dev'],
  args: { open: true, onSelect: fn(), items: paletteItemsFor('cab') },
  play: async ({ canvasElement, args }) => {
    const box = boxOf(canvasElement)
    const input = box.querySelector<HTMLInputElement>('input')!
    await expect(labels(canvasElement)).toEqual(['kitchen renovation', 'budget', 'journal'])

    await userEvent.type(input, 'cab')
    await expect(groups(canvasElement)).toEqual(['pages', 'records', 'actions'])
    await assertHit(canvasElement, 'chase the cabinet quote', 'cab')

    const quote = [...box.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (r) => r.querySelector('[data-part="label"]')!.textContent === 'cabinet quote'
    )!
    await userEvent.hover(quote)
    await expect(quote.getAttribute('aria-selected')).toBe('true')
    await expect(input.getAttribute('aria-activedescendant')).toBe(quote.id)

    await userEvent.click(quote)
    await expect(args.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cabinet-quote' })
    )
  },
}
