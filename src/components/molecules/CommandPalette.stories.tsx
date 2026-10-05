import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { CommandPalette, type CommandPaletteProps } from './CommandPalette'
import { PALETTE_FOOT, PALETTE_FOOT_MOBILE } from './palette-entries'
import {
  PALETTE_ITEMS,
  PALETTE_SUGGESTED,
  paletteChrome,
  paletteItemsFor,
} from '@/__tests__/helpers/palette-fixture'

/**
 * The ⌘K palette — `PondPicker kind="palette"` (#279): its seven states, both
 * themes. Every number asserted below is a literal from
 * `wayfinder/board-values.generated.json` (`.components.PondPicker`, the
 * `kind=palette|theme=paper` variant and its `ink` delta), read back off REAL
 * computed styles. The glass portals, so each frame hands it its own themed
 * `container` — the `.dark` class around that box is the whole theme.
 *
 * The rows are `helpers/palette-fixture` — the one fixture the jest suite reads
 * too, and not an export of this file (Storybook would list it as a story).
 * The live records and ponds come from the shell (`ShellPalette`, tested against a
 * mocked data layer); here a `pond` row and the records for `cab` and `adobe` are
 * the board's frames. `suggested` is likewise a fixture: the shell passes none until
 * it can infer them (#285).
 */

const PAPER = {
  ink: 'rgb(27, 29, 20)',
  tier80: 'rgba(27, 29, 20, 0.8)',
  tier68: 'rgba(27, 29, 20, 0.68)',
  // `.mn-glass`, light — byte-for-byte the board's `glass` recipe.
  glassBorder: 'rgba(255, 255, 255, 0.9)',
}
const INK = {
  ink: 'rgb(250, 249, 239)',
  tier80: 'rgba(250, 249, 239, 0.8)',
  tier68: 'rgba(250, 249, 239, 0.68)',
  // `.mn-glass`, dark — the Shell's. The picker card's own ink delta reads `.09`;
  // ADR 0004 ruling 11 keeps the one shared recipe for the floating-glass family.
  glassBorder: 'rgba(250, 249, 239, 0.2)',
}
type Palette = typeof PAPER

/** The board's `mob` branch against its desktop one (`PondPicker.dc.html`, `kind="palette"`). */
const DESKTOP = {
  width: 520,
  head: 14,
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

type FrameProps = Omit<CommandPaletteProps, 'container' | 'items' | 'onSelect' | 'onClose'> &
  Partial<Pick<CommandPaletteProps, 'items' | 'onSelect' | 'onClose'>> & { ink?: boolean }

/** A themed page the glass floats over. */
function Frame({
  ink,
  items = PALETTE_ITEMS,
  onSelect = fn(),
  onClose = fn(),
  ...props
}: FrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <div
      ref={setContainer}
      data-theme={ink ? 'ink' : 'paper'}
      className={`${ink ? 'dark bg-raw-ink' : 'bg-raw-paper'} min-h-screen w-full`}
    >
      {container && (
        <CommandPalette
          items={items}
          container={container}
          onSelect={onSelect}
          onClose={onClose}
          {...props}
        />
      )}
    </div>
  )
}

const meta = {
  title: 'Molecules/CommandPalette',
  component: Frame,
  parameters: { layout: 'fullscreen' },
  args: {},
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

// ── Assertions ─────────────────────────────────────────────────────────────────

const glassOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-part="glass"]')!
const labels = (root: HTMLElement) =>
  [...glassOf(root).querySelectorAll('[role="option"] [data-part="label"]')].map(
    (l) => l.textContent
  )
const groups = (root: HTMLElement) =>
  [...glassOf(root).querySelectorAll('[data-part="group"]')].map((g) => g.textContent)

/** `glass` · wash · `head` · `headKey` · `groupStyle` · row · `sub` · `hint` · `enter` · `footStyle`. */
async function assertChrome(root: HTMLElement, p: Palette, m: Metrics = DESKTOP) {
  const wash = root.querySelector<HTMLElement>('[data-part="wash"]')!
  await expect(getComputedStyle(wash).position).toBe('fixed')
  await expect(alphaOf(getComputedStyle(wash).backgroundColor)).toBeCloseTo(0.62, 2)

  const glass = glassOf(root)
  const g = getComputedStyle(glass)
  await expect(g.position).toBe('fixed')
  // `Pond 06.13`'s import: top 110 · left 50% · translateX(-40%). Below md it is centred.
  await expect(px(g.top)).toBe(110)
  await expect(px(g.left)).toBeCloseTo(window.innerWidth / 2, 0)
  await expect(g.translate).toMatch(m === DESKTOP ? /^-40%/ : /^-50%/)
  await expect(px(g.width)).toBe(m.width)
  const placed = glass.getBoundingClientRect()
  await expect(placed.left).toBeGreaterThanOrEqual(12)
  await expect(placed.right).toBeLessThanOrEqual(window.innerWidth - 12)
  await expect(g.boxSizing).toBe('border-box')
  await expect(g.padding).toBe('10px')
  await expect(g.borderTopLeftRadius).toBe('20px')
  await expect(g.display).toBe('flex')
  await expect(g.flexDirection).toBe('column')
  await expect(g.rowGap).toBe('2px')
  await expect(g.fontFamily).toMatch(MONO)
  await expect(g.color).toBe(p.ink)
  await expect(g.borderTopWidth).toBe('1px')
  await expect(g.borderTopColor).toBe(p.glassBorder)
  await expect(g.backgroundImage).toMatch(/linear-gradient\(160deg/)
  await expect(g.backdropFilter).toBe('blur(24px) saturate(1.3)')
  // Centred near the top, the glass grows from the middle of its top edge.
  await expect(g.transformOrigin).toBe(`${m.width / 2}px 0px`)

  const head = glass.querySelector<HTMLElement>('[data-part="head"]')!
  const h = getComputedStyle(head)
  await expect(h.display).toBe('flex')
  await expect(h.alignItems).toBe('center')
  await expect(h.columnGap).toBe('10px')
  await expect(h.padding).toBe('10px 12px 14px')
  await expect(h.marginBottom).toBe('4px')
  await expect(h.borderBottomWidth).toBe('1px')
  await expect(alphaOf(h.borderBottomColor)).toBeCloseTo(0.09, 2)
  await expect(h.fontFamily).toMatch(MONO)
  await expect(px(h.fontSize)).toBe(m.head)
  const waves = head.querySelector<HTMLElement>('[data-icon="waves-02"]')!
  await expect(getComputedStyle(waves).width).toBe('13px')
  await expect(getComputedStyle(waves).height).toBe('13px')
  const input = head.querySelector<HTMLInputElement>('input')!
  const i = getComputedStyle(input)
  await expect(i.fontFamily).toMatch(MONO)
  await expect(px(i.fontSize)).toBe(m.head)
  await expect(i.color).toBe(p.ink)
  await expect(input.getAttribute('role')).toBe('combobox')
  // A floating glass with a combobox, NOT a dialog: nothing traps, nothing is
  // modal, and the row the keys act on is named on the input rather than focused.
  // All four are invisible if they break, and a screen reader loses the list.
  await expect(root.querySelector('[role="dialog"]')).toBeNull()
  await expect(root.querySelector('[aria-modal]')).toBeNull()
  const list = glass.querySelector<HTMLElement>('[role="listbox"]')!
  await expect(input.getAttribute('aria-controls')).toBe(list.id)
  await expect(input.getAttribute('aria-expanded')).toBe('true')
  const sel = glass.querySelector<HTMLElement>('[aria-selected="true"]')
  await expect(input.getAttribute('aria-activedescendant')).toBe(sel ? sel.id : null)
  // A row is an `option`, never a button — a button here would take focus off the
  // input and the typing would stop.
  for (const o of glass.querySelectorAll('[role="option"]')) await expect(o.tagName).toBe('DIV')
  const key = head.querySelector<HTMLElement>('[data-part="head-key"]')!
  await expect(key.textContent).toBe('esc')
  await expect(px(getComputedStyle(key).fontSize)).toBe(10.5)
  await expect(getComputedStyle(key).color).toBe(p.tier80)

  for (const group of glass.querySelectorAll<HTMLElement>('[data-part="group"]')) {
    const s = getComputedStyle(group)
    await expect(s.padding).toBe('8px 12px 4px')
    await expect(s.fontFamily).toMatch(/PP Neue Montreal/)
    await expect(s.fontFamily).not.toMatch(MONO)
    await expect(s.fontWeight).toBe('500')
    await expect(px(s.fontSize)).toBe(10.5)
    // `.1em` at 10.5px, uppercase — the eyebrow, not the `/` menu's `.04em` label.
    await expect(tracking(s.letterSpacing)).toBeCloseTo(1.05, 2)
    await expect(s.textTransform).toBe('uppercase')
    await expect(s.color).toBe(p.tier68)
  }

  for (const row of glass.querySelectorAll<HTMLElement>('[role="option"]')) {
    const s = getComputedStyle(row)
    const kind = row.getAttribute('data-kind')
    const selected = row.getAttribute('aria-selected') === 'true'
    await expect(s.display).toBe('flex')
    await expect(s.alignItems).toBe('center')
    await expect(s.columnGap).toBe('10px')
    await expect(s.padding).toBe(m.rowPad)
    await expect(s.borderTopLeftRadius).toBe('14px')
    // SANS — ADR 0004 §4 — at the board's 13.5 and tracking 0.
    await expect(s.fontFamily).toMatch(/PP Neue Montreal/)
    await expect(s.fontFamily).not.toMatch(MONO)
    await expect(px(s.fontSize)).toBe(m.row)
    await expect(tracking(s.letterSpacing)).toBe(0)
    await expect(s.color).toBe(kind === 'action' ? p.tier80 : p.ink)
    await expect(alphaOf(s.backgroundColor)).toBeCloseTo(selected ? 0.07 : 0, 2)

    const label = row.querySelector<HTMLElement>('[data-part="label"]')!
    const glyph = row.querySelector<HTMLElement>('[data-icon]')
    await expect(getComputedStyle(label).fontWeight).toBe(glyph ? '500' : '400')
    await expect(getComputedStyle(label).whiteSpace).toBe('nowrap')
    await expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
    if (glyph) {
      await expect(getComputedStyle(glyph).width).toBe('13px')
      await expect(getComputedStyle(glyph).height).toBe('13px')
    }
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
      await expect(ss.textOverflow).toBe('ellipsis')
      // Inline: the sub sits beside the name, not under it — to its right, centred on the same line.
      const sb = sub.getBoundingClientRect()
      const lb = label.getBoundingClientRect()
      await expect(sb.left).toBeGreaterThanOrEqual(lb.right)
      await expect(Math.abs(sb.top + sb.height / 2 - (lb.top + lb.height / 2))).toBeLessThan(1)
    }
    const hint = row.querySelector<HTMLElement>('[data-part="hint"]')
    if (hint) {
      const hs = getComputedStyle(hint)
      await expect(selected).toBe(false)
      await expect(hs.fontFamily).toMatch(MONO)
      await expect(px(hs.fontSize)).toBe(10.5)
      await expect(hs.color).toBe(p.tier68)
      await expect(hs.maxWidth).toBe('45%')
    }
    const enter = row.querySelector<HTMLElement>('[data-part="enter"]')
    await expect(enter !== null).toBe(selected)
    if (enter) {
      await expect(getComputedStyle(enter).fontFamily).toMatch(MONO)
      await expect(px(getComputedStyle(enter).fontSize)).toBe(10.5)
      await expect(getComputedStyle(enter).color).toBe(p.tier80)
    }
  }

  const foot = glass.querySelector<HTMLElement>('[data-part="foot"]')!
  const f = getComputedStyle(foot)
  // Hidden hints stay in the DOM, so what the board draws is what is displayed.
  const shown = [...foot.children]
    .filter((c) => getComputedStyle(c).display !== 'none')
    .map((c) => c.textContent)
  await expect(shown).toEqual([...m.foot])
  await expect(f.display).toBe('flex')
  await expect(f.flexWrap).toBe('wrap')
  await expect(f.columnGap).toBe('14px')
  await expect(f.padding).toBe('10px 12px 4px')
  await expect(f.marginTop).toBe('4px')
  await expect(f.borderTopWidth).toBe('1px')
  await expect(alphaOf(f.borderTopColor)).toBeCloseTo(0.09, 2)
  await expect(px(f.fontSize)).toBe(10.5)
  await expect(f.color).toBe(p.tier68)

  // The chrome is lowercase — Pond's words. A page's title is content and keeps
  // its case (ADR 0004 §4), so the rows' names are not in this string.
  await expect(paletteChrome(glass)).not.toMatch(/[A-Z]/)
}

async function assertHit(root: HTMLElement, label: string, hit: string) {
  const row = [...glassOf(root).querySelectorAll<HTMLElement>('[role="option"]')].find(
    (r) => r.querySelector('[data-part="label"]')!.textContent === label
  )!
  const el = row.querySelector<HTMLElement>('[data-part="hit"]')!
  await expect(el.textContent).toBe(hit)
  const s = getComputedStyle(el)
  await expect(s.textDecorationLine).toBe('underline')
  await expect(s.textUnderlineOffset).toBe('3px')
  await expect(s.textDecorationThickness).toBe('1px')
}

// ── opened ─────────────────────────────────────────────────────────────────────

async function assertOpened(root: HTMLElement, p: Palette, suggested: boolean, m = DESKTOP) {
  await assertChrome(root, p, m)
  const input = glassOf(root).querySelector<HTMLInputElement>('input')!
  await expect(input.placeholder).toBe('jump to a page, or > for actions')
  await expect(document.activeElement).toBe(input)
  // The board's frame: `recent`, three pages, then `suggested`, two actions. With
  // nothing from the host, the second group is absent — not stood in for.
  await expect(groups(root)).toEqual(suggested ? ['recent', 'suggested'] : ['recent'])
  await expect(labels(root)).toEqual([
    'kitchen renovation',
    'budget',
    'journal',
    ...(suggested ? ['chase the cabinet quote', 'log a workout'] : []),
  ])
  const actions = glassOf(root).querySelectorAll('[data-kind="action"]')
  await expect(actions.length).toBe(suggested ? 2 : 0)
}

/** Nothing typed, nothing inferred: the last three pages under `recent`, and no `suggested` faked (#285). */
export const Opened: Story = {
  play: async ({ canvasElement }) => assertOpened(canvasElement, PAPER, false),
}
export const OpenedInk: Story = {
  args: { ink: true },
  play: async ({ canvasElement }) => assertOpened(canvasElement, INK, false),
}

/** The board's `opened` frame in full: `recent`, then the two `suggested` actions the host supplied. */
export const OpenedSuggested: Story = {
  args: { suggested: PALETTE_SUGGESTED },
  play: async ({ canvasElement }) => assertOpened(canvasElement, PAPER, true),
}
export const OpenedSuggestedInk: Story = {
  args: { suggested: PALETTE_SUGGESTED, ink: true },
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
  args: { defaultQuery: 'cab', items: paletteItemsFor('cab') },
  play: async ({ canvasElement }) => assertTyping(canvasElement, PAPER),
}
export const TypingInk: Story = {
  args: { defaultQuery: 'cab', items: paletteItemsFor('cab'), ink: true },
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
  args: { defaultQuery: '> log' },
  play: async ({ canvasElement }) => assertActions(canvasElement, PAPER),
}
export const ActionsInk: Story = {
  args: { defaultQuery: '> log', ink: true },
  play: async ({ canvasElement }) => assertActions(canvasElement, INK),
}

// ── record ─────────────────────────────────────────────────────────────────────

async function assertRecord(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  await expect(groups(root)).toEqual(['records', 'actions'])
  const selected = glassOf(root).querySelector<HTMLElement>('[aria-selected="true"]')!
  await expect(selected.getAttribute('data-kind')).toBe('record')
  await expect(selected.querySelector('[data-part="sub"]')!.textContent).toBe(
    'subscriptions · renews 28 sep'
  )
  await assertHit(root, 'adobe creative cloud', 'adobe')
}

/** `adobe`: a record is first class, the matched field under its name. */
export const Record: Story = {
  args: { defaultQuery: 'adobe', items: paletteItemsFor('adobe') },
  play: async ({ canvasElement }) => assertRecord(canvasElement, PAPER),
}
export const RecordInk: Story = {
  args: { defaultQuery: 'adobe', items: paletteItemsFor('adobe'), ink: true },
  play: async ({ canvasElement }) => assertRecord(canvasElement, INK),
}

// ── empty ──────────────────────────────────────────────────────────────────────

async function assertEmpty(root: HTMLElement, p: Palette, m: Metrics = DESKTOP) {
  await assertChrome(root, p, m)
  const note = glassOf(root).querySelector<HTMLElement>('[data-part="note"]')!
  await expect(note.textContent).toBe('no page or record called “cabnet”')
  const s = getComputedStyle(note)
  await expect(s.padding).toBe('10px 12px')
  await expect(s.fontFamily).toMatch(MONO)
  await expect(px(s.fontSize)).toBe(m.note)
  await expect(px(s.lineHeight)).toBeCloseTo(m.note * 1.55, 1)
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
  args: { defaultQuery: 'cabnet' },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, PAPER),
}
export const EmptyInk: Story = {
  args: { defaultQuery: 'cabnet', ink: true },
  play: async ({ canvasElement }) => assertEmpty(canvasElement, INK),
}

// ── scoped ─────────────────────────────────────────────────────────────────────

const MONEY = { id: 'money', label: 'money' }

async function assertScoped(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const chip = glassOf(root).querySelector<HTMLElement>('[data-part="scope"]')!
  await expect(chip.textContent).toBe('in money:')
  const s = getComputedStyle(chip)
  await expect(s.padding).toBe('1px 6px')
  await expect(s.borderTopLeftRadius).toBe('6px')
  await expect(alphaOf(s.backgroundColor)).toBeCloseTo(0.07, 2)
  await expect(s.color).toBe(p.tier80)
  await expect(glassOf(root).querySelector<HTMLInputElement>('input')!.placeholder).toBe('')
  await expect(groups(root)).toEqual([])
  // `Savings` keeps its case: a page's title is content, only the chrome is lowercase.
  await expect(labels(root)).toEqual(['budget', 'subscriptions', 'Savings', 'transactions'])
  await expect(
    [...glassOf(root).querySelectorAll('[data-part="sub"]')].map((x) => x.textContent)
  ).toEqual(['page', 'page', 'page', 'database'])
}

/** The rail's selected page and its children, the kind under each name. */
export const Scoped: Story = {
  args: { scope: MONEY },
  play: async ({ canvasElement }) => assertScoped(canvasElement, PAPER),
}
export const ScopedInk: Story = {
  args: { scope: MONEY, ink: true },
  play: async ({ canvasElement }) => assertScoped(canvasElement, INK),
}

// ── ponds ──────────────────────────────────────────────────────────

async function assertPonds(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  await expect(groups(root)).toEqual(['ponds', 'pages in life', 'actions'])
  await expect(labels(root)).toEqual([
    'make noise',
    'make this a page',
    'new pond “make”',
    'ask pond about “make”',
  ])
  await expect(
    [...glassOf(root).querySelectorAll('[data-kind="pond"] [data-part="sub"]')].map(
      (x) => x.textContent
    )
  ).toEqual(['pond · switch'])
  const pond = glassOf(root).querySelector<HTMLElement>('[data-kind="pond"]')!
  await expect(pond.getAttribute('aria-selected')).toBe('true')
  await expect(pond.querySelector('[data-part="hint"]')).toBeNull()
  await assertHit(root, 'make noise', 'make')
}

/** `make`: a pond above the pages (6m), and `new pond “make”` among the actions. */
export const Ponds: Story = {
  args: { defaultQuery: 'make' },
  play: async ({ canvasElement }) => assertPonds(canvasElement, PAPER),
}
export const PondsInk: Story = {
  args: { defaultQuery: 'make', ink: true },
  play: async ({ canvasElement }) => assertPonds(canvasElement, INK),
}

// ── mobile — the board's `mob` branch ──────────────────────────────────────────

/** An iPhone-width viewport, below Tailwind's `md` (768). */
const MOBILE_VIEWPORT = {
  viewport: {
    options: { phone: { name: 'phone', styles: { width: '390px', height: '844px' } } },
  },
}
const onPhone = { viewport: { value: 'phone', isRotated: false } }

async function assertPhone() {
  await expect(window.innerWidth).toBeLessThan(768)
}

/** 360 wide, head 16, rows `13px 12px` at 15, sub 13; the foot keeps `↵ open` and `> actions only`. */
export const MobileOpened: Story = {
  parameters: MOBILE_VIEWPORT,
  globals: onPhone,
  play: async ({ canvasElement }) => {
    await assertPhone()
    await assertOpened(canvasElement, PAPER, false, MOBILE)
  },
}

/** `cab`: the sub-line is 13 on a phone, the hit still underlined. */
export const MobileTyping: Story = {
  args: { defaultQuery: 'cab', items: paletteItemsFor('cab') },
  parameters: MOBILE_VIEWPORT,
  globals: onPhone,
  play: async ({ canvasElement }) => {
    await assertPhone()
    await assertTyping(canvasElement, PAPER, MOBILE)
  },
}

/** `cabnet`: the note is 13 on a phone. */
export const MobileEmpty: Story = {
  args: { defaultQuery: 'cabnet' },
  parameters: MOBILE_VIEWPORT,
  globals: onPhone,
  play: async ({ canvasElement }) => {
    await assertPhone()
    await assertEmpty(canvasElement, PAPER, MOBILE)
  },
}

// ── the keys ───────────────────────────────────────────────────────────────────

/** ↓↓ then ↵ opens the third row; ⌫ on an empty line clears the scope; esc closes. */
export const Keys: Story = {
  args: { scope: MONEY, onSelect: fn(), onClose: fn() },
  play: async ({ canvasElement, args }) => {
    await expect(glassOf(canvasElement).querySelector('[data-part="scope"]')).not.toBeNull()
    await userEvent.keyboard('{Backspace}')
    await expect(glassOf(canvasElement).querySelector('[data-part="scope"]')).toBeNull()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'journal' }))
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}

// ── dismissal, and the one button in the glass ─────────────────────────────────

/**
 * Two ways out, and two that are not: esc and a press anywhere outside the glass
 * close; a press INSIDE (on the input) must not, or the palette shuts the moment
 * someone clicks into the field to type — and ⌘K is not the palette's to handle, the
 * shell owns that key (KAN-57).
 *
 * `esc` is the glass's only button, so it is the only thing in it that can take
 * focus — and it wears the house mist ring, asserted as the painted outline rather
 * than the class name that asks for it (#252 shipped a right class and a wrong pixel).
 */
export const Dismissal: Story = {
  args: { onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    const input = glass.querySelector<HTMLInputElement>('input')!

    // Inside the glass: no close.
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await expect(args.onClose).not.toHaveBeenCalled()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await expect(args.onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalledTimes(2)
    await userEvent.keyboard('{Meta>}k{/Meta}{Control>}k{/Control}')
    await expect(args.onClose).toHaveBeenCalledTimes(2)

    // Tab off the input reaches `esc`, the one button — and the mist ring paints.
    const esc = glass.querySelector<HTMLElement>('[data-part="head-key"]')!
    await expect(esc.tagName).toBe('BUTTON')
    await expect(esc.textContent).toBe('esc')
    await userEvent.tab()
    await expect(esc).toHaveFocus()
    const f = getComputedStyle(esc)
    // `PondControl`'s focus outline: 2px solid mist, offset 2 — one owner, never flips.
    await expect(f.outlineStyle).toBe('solid')
    await expect(f.outlineWidth).toBe('2px')
    await expect(f.outlineOffset).toBe('2px')
    await expect(f.outlineColor).toBe('rgb(165, 200, 209)')

    await userEvent.click(esc)
    await expect(args.onClose).toHaveBeenCalledTimes(3)
  },
}

// ── the pointer, and typing for real ──────────────────────────────────────────

/**
 * The mouse path, and a query typed a letter at a time rather than handed in as
 * `defaultQuery`: the list narrows live, the hit is split on the row that matched,
 * hovering a row selects it (and the input says so), and a click opens it.
 */
export const Pointer: Story = {
  args: { onSelect: fn(), items: paletteItemsFor('cab') },
  play: async ({ canvasElement, args }) => {
    const glass = glassOf(canvasElement)
    const input = glass.querySelector<HTMLInputElement>('input')!
    await expect(labels(canvasElement)).toEqual(['kitchen renovation', 'budget', 'journal'])

    await userEvent.type(input, 'cab')
    await expect(groups(canvasElement)).toEqual(['pages', 'records', 'actions'])
    await assertHit(canvasElement, 'chase the cabinet quote', 'cab')

    // Hover selects, and the input names the row it selected.
    const quote = [...glass.querySelectorAll<HTMLElement>('[role="option"]')].find(
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
