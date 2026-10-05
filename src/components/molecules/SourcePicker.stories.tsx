import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'

import { SourcePicker, type SourcePickerProps } from './SourcePicker'
import type { SourceDatabase, SourceField } from './source-entries'
import { CHART_KINDS } from '@/lib/modules/view/aggregate'
import { CHART_LABEL } from './source-entries'

/**
 * The source picker — `PondPicker kind="source"` (#280): its three states, both
 * themes. Every number asserted below is a literal from
 * `wayfinder/board-values.generated.json` (`.components.PondPicker`, the
 * `kind=source|theme=paper` states and the `theme=ink` delta), read back off REAL
 * computed styles. The glass portals, so each frame hands the picker its own
 * themed `container` — the `.dark` class around that box is the whole theme.
 *
 * The rows are the board's own fixtures: the recipes pond's five databases, the
 * calories source's `day` + `kcal` fields.
 */

const PAPER = {
  ink: 'rgb(27, 29, 20)',
  paper: 'rgb(250, 249, 239)',
  tier80: 'rgba(27, 29, 20, 0.8)',
  tier68: 'rgba(27, 29, 20, 0.68)',
  // `.mn-glass`, light — byte-for-byte the board's `glass` recipe.
  glassBorder: 'rgba(255, 255, 255, 0.9)',
}
const INK = {
  ink: 'rgb(250, 249, 239)',
  paper: 'rgb(27, 29, 20)',
  tier80: 'rgba(250, 249, 239, 0.8)',
  tier68: 'rgba(250, 249, 239, 0.68)',
  // `.mn-glass`, dark — the Shell's dark frames. The picker board's own ink delta
  // reads `.09`; ADR 0004 ruling 11 keeps the one shared recipe for the whole
  // floating-glass family (the composed context outranks the component card).
  glassBorder: 'rgba(250, 249, 239, 0.2)',
}
type Palette = typeof PAPER

const MONO = /PP Neue Montreal Mono/
const px = (v: string) => parseFloat(v)

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  if (color === 'rgba(0, 0, 0, 0)') return 0
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

// ── Fixtures — the board's rows ────────────────────────────────────────────────

const DATABASES: SourceDatabase[] = [
  { id: 'recipes', title: 'recipes', records: 18, recordsAre: 'pages' },
  { id: 'calories', title: 'calories', records: 412, recordsAre: 'rows' },
  { id: 'transactions', title: 'transactions', records: 1380, recordsAre: 'rows' },
  { id: 'subscriptions', title: 'subscriptions', records: 6, recordsAre: 'pages' },
  { id: 'sleep', title: 'sleep nights', records: 241, recordsAre: 'rows' },
]
// Ids, because a chart config names fields by SCHEMA ID. A pick that carried only
// the kind made a chart bucketed by record title plotting a constant 1 — silent,
// and the row had promised `kcal by day`.
const CALORIE_FIELDS: SourceField[] = [
  { id: 'f-day', name: 'day', type: 'date' },
  { id: 'f-kcal', name: 'kcal', type: 'number' },
]
const loadFields = async (id: string) => (id === 'calories' ? CALORIE_FIELDS : [])

// ── Frame ──────────────────────────────────────────────────────────────────────

type FrameProps = Omit<
  SourcePickerProps,
  'anchor' | 'container' | 'databases' | 'pageTitle' | 'onPick' | 'onClose'
> &
  Partial<Pick<SourcePickerProps, 'databases' | 'pageTitle' | 'onPick' | 'onClose'>> & {
    ink?: boolean
  }

/** A field to type into, and a themed box the glass portals into. */
function Frame({
  ink,
  databases = DATABASES,
  pageTitle = 'recipes',
  onPick = fn(),
  onClose = fn(),
  ...props
}: FrameProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLTextAreaElement>(null)
  return (
    <div
      ref={setContainer}
      data-theme={ink ? 'ink' : 'paper'}
      className={`${ink ? 'dark bg-raw-ink' : 'bg-raw-paper'} h-[560px] w-[460px] rounded-mn-inner p-mn-6`}
    >
      <textarea
        ref={anchor}
        aria-label="page"
        defaultValue={`/${props.block}`}
        className="w-full resize-none bg-transparent font-serif text-[16px] text-mn-text outline-none"
        rows={1}
      />
      {container && (
        <SourcePicker
          databases={databases}
          pageTitle={pageTitle}
          anchor={anchor}
          container={container}
          onPick={onPick}
          onClose={onClose}
          {...props}
        />
      )}
    </div>
  )
}

const meta = {
  title: 'Organisms/pickers/2e · choose a source',
  component: Frame,
  parameters: { layout: 'centered' },
  args: { block: 'table' },
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

/** `glass` (340) · `head` · `groupStyle` · row · `iconWrap` · `sub` · `hint` · `enter` · `footStyle` — every state shares these. */
async function assertChrome(root: HTMLElement, p: Palette) {
  const glass = glassOf(root)
  await expect(glass.dataset.kind).toBe('source')
  const g = getComputedStyle(glass)
  await expect(px(g.width)).toBe(340)
  await expect(g.boxSizing).toBe('border-box')
  await expect(g.paddingTop).toBe('8px')
  await expect(g.paddingLeft).toBe('8px')
  await expect(g.borderTopLeftRadius).toBe('20px')
  await expect(g.display).toBe('flex')
  await expect(g.flexDirection).toBe('column')
  await expect(g.rowGap).toBe('1px')
  await expect(g.fontFamily).toMatch(MONO)
  await expect(g.color).toBe(p.ink)
  await expect(g.borderTopWidth).toBe('1px')
  await expect(g.borderTopColor).toBe(p.glassBorder)
  await expect(g.backgroundImage).toMatch(/linear-gradient\(160deg/)
  await expect(g.backdropFilter).toBe('blur(24px) saturate(1.3)')
  await expect(glass.querySelector('input')).toBeNull()

  // All three states draw a head (the issue's addendum): `flex · gap 10 · 8px 10px 10px · mb 4 · 1px ink .09 · mono 12`.
  const head = glass.querySelector<HTMLElement>('[data-part="head"]')!
  const h = getComputedStyle(head)
  await expect(h.display).toBe('flex')
  await expect(h.alignItems).toBe('center')
  await expect(h.columnGap).toBe('10px')
  await expect(h.padding).toBe('8px 10px 10px')
  await expect(h.marginBottom).toBe('4px')
  await expect(h.borderBottomWidth).toBe('1px')
  await expect(alphaOf(h.borderBottomColor)).toBeCloseTo(0.09, 2)
  await expect(h.fontFamily).toMatch(MONO)
  await expect(px(h.fontSize)).toBe(12)
  await expect(getComputedStyle(head.querySelector('[data-part="head-text"]')!).color).toBe(p.ink)

  for (const group of glass.querySelectorAll<HTMLElement>('[data-part="group"]')) {
    const s = getComputedStyle(group)
    await expect(s.padding).toBe('8px 10px 5px')
    await expect(px(s.fontSize)).toBe(10.5)
    // `.04em` at 10.5px — ADR 0003's third amendment: never snapped, never uppercased.
    await expect(px(s.letterSpacing)).toBeCloseTo(0.42, 2)
    await expect(s.textTransform).toBe('none')
    await expect(s.color).toBe(p.tier68)
  }

  for (const row of glass.querySelectorAll<HTMLElement>('[role="option"]')) {
    const s = getComputedStyle(row)
    await expect(s.display).toBe('flex')
    await expect(s.alignItems).toBe('center')
    await expect(s.columnGap).toBe('10px')
    await expect(s.padding).toBe('7px 10px')
    await expect(s.borderTopLeftRadius).toBe('10px')
    await expect(s.fontFamily).toMatch(MONO)
    await expect(px(s.fontSize)).toBe(12.5)
    await expect(px(s.letterSpacing)).toBeCloseTo(0.125, 3)
    const selected = row.getAttribute('aria-selected') === 'true'
    await expect(alphaOf(s.backgroundColor)).toBeCloseTo(selected ? 0.07 : 0, 2)
    const svg = row.querySelector('svg')
    if (svg) {
      await expect(svg.getAttribute('width')).toBe('13')
      await expect(svg.getAttribute('height')).toBe('13')
      await expect(svg.getAttribute('stroke-width')).toBe('1.4')
      await expect(svg.getAttribute('fill')).toBe('none')
      await expect(svg.getAttribute('stroke')).toBe('currentColor')
      await expect(getComputedStyle(row.querySelector('[data-part="icon"]')!).color).toBe(p.tier80)
    }
    const sub = row.querySelector<HTMLElement>('[data-part="sub"]')
    if (sub) {
      const u = getComputedStyle(sub)
      await expect(px(u.fontSize)).toBe(10.5)
      await expect(u.color).toBe(p.tier68)
      await expect(u.whiteSpace).toBe('nowrap')
      await expect(u.textOverflow).toBe('ellipsis')
    }
    const hint = row.querySelector<HTMLElement>('[data-part="hint"]')
    if (hint) {
      const t = getComputedStyle(hint)
      await expect(t.flex).toBe('0 1 auto')
      await expect(t.maxWidth).toBe('45%')
      await expect(px(t.fontSize)).toBe(10.5)
      await expect(t.color).toBe(p.tier68)
      await expect(t.whiteSpace).toBe('nowrap')
      await expect(t.textOverflow).toBe('ellipsis')
    }
  }
  const enter = glass.querySelector<HTMLElement>('[aria-selected="true"] [data-part="enter"]')
  if (enter) {
    const e = getComputedStyle(enter)
    await expect(px(e.fontSize)).toBe(10.5)
    await expect(e.color).toBe(p.tier80)
    await expect(e.fontFamily).toMatch(MONO)
  }

  // All three states draw a foot: `flex wrap · gap 14 · 9px 10px 4px · mt 4 · 1px ink .09 · 10.5 · ink .68`.
  const foot = glass.querySelector<HTMLElement>('[data-part="foot"]')!
  const f = getComputedStyle(foot)
  await expect(f.display).toBe('flex')
  await expect(f.flexWrap).toBe('wrap')
  await expect(f.columnGap).toBe('14px')
  await expect(f.padding).toBe('9px 10px 4px')
  await expect(f.marginTop).toBe('4px')
  await expect(f.borderTopWidth).toBe('1px')
  await expect(alphaOf(f.borderTopColor)).toBeCloseTo(0.09, 2)
  await expect(px(f.fontSize)).toBe(10.5)
  await expect(f.color).toBe(p.tier68)

  // Every string on the surface is lowercase — Pond's words, no build vocabulary.
  await expect(glass.textContent).not.toMatch(/[A-Z]/)
}

// ── source ─────────────────────────────────────────────────────────────────────

async function assertSource(root: HTMLElement, p: Palette) {
  await assertChrome(root, p)
  const glass = glassOf(root)
  await expect(glass.dataset.step).toBe('source')
  await expect(glass.querySelector('[data-part="head-text"]')!.textContent).toBe('/table')
  await expect(groups(root)).toEqual(['new', 'or view an existing one'])
  await expect(labels(root)).toEqual(['new database — recipes', ...DATABASES.map((d) => d.title)])
  const rows = glass.querySelectorAll<HTMLElement>('[role="option"]')
  await expect(rows[0].getAttribute('aria-selected')).toBe('true')
  for (const row of rows) await expect(getComputedStyle(row).color).toBe(p.ink)
  await expect(
    [...rows].slice(1).map((r) => r.querySelector('[data-part="hint"]')!.textContent)
  ).toEqual(['18 records', '412 rows', '1,380 rows', '6 records', '241 rows'])
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    'named after this page↵ create'
  )
}

/** `/table`: `new database — recipes` selected under `new`, five databases one row down, the create foot. Light. */
export const Source: Story = {
  name: 'source',
  play: async ({ canvasElement }) => assertSource(canvasElement, PAPER),
}

/** The same frame on the dark ground — ink flips, the glass follows the Shell's dark recipe. */
export const SourceInk: Story = {
  name: 'source · ink',
  args: { ink: true },
  play: async ({ canvasElement }) => assertSource(canvasElement, INK),
}

// ── type ───────────────────────────────────────────────────────────────────────

async function assertType(root: HTMLElement, p: Palette) {
  const glass = glassOf(root)
  await waitFor(async () => expect(glass.querySelectorAll('[role="option"]')).toHaveLength(4))
  await assertChrome(root, p)
  await expect(glass.dataset.step).toBe('type')
  await expect(glass.querySelector('[data-part="head-text"]')!.textContent).toBe(
    '/chart › calories'
  )
  await expect(groups(root)).toEqual(['fits date + number'])
  await expect(labels(root)).toEqual(['line', 'area + target', 'heatmap', 'all charts'])
  await expect([...glass.querySelectorAll('[data-part="sub"]')].map((s) => s.textContent)).toEqual([
    'kcal by day',
    'kcal against a target',
    'one cell a day',
  ])
  const rows = glass.querySelectorAll<HTMLElement>('[role="option"]')
  await expect(rows[0].getAttribute('aria-selected')).toBe('true')
  // `all charts · 13` — the count is CHART_KINDS', never typed.
  await expect(rows[3].querySelector('[data-part="hint"]')!.textContent).toBe(
    String(CHART_KINDS.length)
  )
  // The board's `G(' ')`: a rule, `1px ink .09` top · margin 4px 10px 0 · height 4 · no padding.
  const rule = glass.querySelector<HTMLElement>('[data-part="rule"]')!
  const r = getComputedStyle(rule)
  await expect(r.borderTopWidth).toBe('1px')
  await expect(alphaOf(r.borderTopColor)).toBeCloseTo(0.09, 2)
  await expect(r.margin).toBe('4px 10px 0px')
  await expect(px(r.height)).toBe(4)
  await expect(r.padding).toBe('0px')
  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    'suggested from the source’s fields'
  )
}

/** `/chart › calories`: the fits group named from the source's fields, a rule, `all charts · 13`, the note. */
export const Type: Story = {
  name: 'type',
  args: {
    block: 'chart',
    defaultStep: 'type',
    defaultSource: DATABASES[1],
    loadFields,
  },
  play: async ({ canvasElement }) => assertType(canvasElement, PAPER),
}

export const TypeInk: Story = {
  name: 'type · ink',
  args: {
    block: 'chart',
    defaultStep: 'type',
    defaultSource: DATABASES[1],
    loadFields,
    ink: true,
  },
  play: async ({ canvasElement }) => assertType(canvasElement, INK),
}

/**
 * ↵ on `all charts` unfolds the thirteen in place. This frame exists so the chrome
 * guard's lowercase check actually SEES those thirteen rows: a `ChartKind` is an
 * engine key, and `net` / `composed` would reach the glass as build vocabulary if
 * anything ever rendered the enum instead of `CHART_LABEL`.
 */
export const AllCharts: Story = {
  tags: ['!dev'],
  args: {
    block: 'chart',
    defaultStep: 'type',
    defaultSource: DATABASES[1],
    loadFields,
  },
  play: async ({ canvasElement }) => {
    const glass = glassOf(canvasElement)
    await waitFor(() => expect(labels(canvasElement)).toContain('all charts'))
    await userEvent.click(
      [...glass.querySelectorAll<HTMLElement>('[role="option"]')].find((r) =>
        r.textContent?.startsWith('all charts')
      )!
    )
    await waitFor(() => expect(groups(canvasElement)).toEqual(['all charts']))
    await assertChrome(canvasElement, PAPER)
    await expect(labels(canvasElement)).toEqual(CHART_KINDS.map((k) => CHART_LABEL[k]))
    await expect(labels(canvasElement)).not.toContain('net')
    await expect(labels(canvasElement)).not.toContain('composed')
  },
}

// ── new ────────────────────────────────────────────────────────────────────────

async function assertNew(root: HTMLElement, p: Palette) {
  const glass = glassOf(root)
  await userEvent.keyboard('{Enter}')
  await waitFor(async () => expect(glass.dataset.step).toBe('new'))
  await assertChrome(root, p)
  await expect(glass.querySelector('[data-part="head-text"]')!.textContent).toBe(
    'new database — recipes'
  )
  await expect(groups(root)).toEqual(['fields', 'records are'])
  await expect(labels(root)).toEqual(['title', 'field'])
  const rows = glass.querySelectorAll<HTMLElement>('[role="option"]')
  await expect(rows[0].querySelector('[data-part="hint"]')!.textContent).toBe('text')
  await expect(getComputedStyle(rows[0]).color).toBe(p.ink)
  // The `field` add row is the board's `faint`: the whole row at ink .8, no hint.
  await expect(getComputedStyle(rows[1]).color).toBe(p.tier80)
  await expect(rows[1].querySelector('[data-part="hint"]')).toBeNull()
  await expect(rows[1].querySelector('svg')).not.toBeNull()

  // The one segmented control in the handoff:
  // `flex · gap 4 · padding 3 · margin 2px 10px 4px · radius 10 · ink .06 · mono`.
  const seg = glass.querySelector<HTMLElement>('[data-part="seg"]')!
  const s = getComputedStyle(seg)
  await expect(s.display).toBe('flex')
  await expect(s.columnGap).toBe('4px')
  await expect(s.padding).toBe('3px')
  await expect(s.margin).toBe('2px 10px 4px')
  await expect(s.borderTopLeftRadius).toBe('10px')
  await expect(alphaOf(s.backgroundColor)).toBeCloseTo(0.06, 2)
  await expect(s.fontFamily).toMatch(MONO)
  // Each option: `flex 1 · centred · 7px 0 · radius 8 · 12`; the pressed one is
  // full ink ground with paper text — the one place the picker inverts, and it flips.
  const opts = seg.querySelectorAll<HTMLElement>('[data-part="seg-opt"]')
  await expect([...opts].map((o) => o.textContent)).toEqual(['pages', 'rows only'])
  await expect([...opts].map((o) => o.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  for (const opt of opts) {
    const o = getComputedStyle(opt)
    await expect(o.flexGrow).toBe('1')
    await expect(o.textAlign).toBe('center')
    await expect(o.padding).toBe('7px 0px')
    await expect(o.borderTopLeftRadius).toBe('8px')
    await expect(px(o.fontSize)).toBe(12)
    await expect(o.fontFamily).toMatch(MONO)
  }
  await expect(getComputedStyle(opts[0]).backgroundColor).toBe(p.ink)
  await expect(getComputedStyle(opts[0]).color).toBe(p.paper)
  await expect(alphaOf(getComputedStyle(opts[1]).backgroundColor)).toBe(0)
  await expect(getComputedStyle(opts[1]).color).toBe(p.tier80)

  await expect(glass.querySelector('[data-part="foot"]')!.textContent).toBe(
    'filed in databasesthis page gets a table view'
  )

  // It actually switches: the inverted ground follows the press.
  await userEvent.click(opts[1])
  await expect(opts[1].getAttribute('aria-pressed')).toBe('true')
  await expect(opts[0].getAttribute('aria-pressed')).toBe('false')
  await expect(getComputedStyle(opts[1]).backgroundColor).toBe(p.ink)
  await expect(getComputedStyle(opts[1]).color).toBe(p.paper)
  await expect(alphaOf(getComputedStyle(opts[0]).backgroundColor)).toBe(0)
}

/** ↵ on the new row: `new database — recipes`, its fields, the faint add row, and the segmented control. */
export const New: Story = {
  name: 'new',
  play: async ({ canvasElement }) => {
    within(canvasElement).getByLabelText('page').focus()
    await assertNew(canvasElement, PAPER)
  },
}

export const NewInk: Story = {
  name: 'new · ink',
  args: { ink: true },
  play: async ({ canvasElement }) => {
    within(canvasElement).getByLabelText('page').focus()
    await assertNew(canvasElement, INK)
  },
}

// ── the keys ───────────────────────────────────────────────────────────────────

/** From the field: ↓ then ↵ views `recipes`; esc only closes and keeps the text; `field` adds a field. */
export const Keys: Story = {
  tags: ['!dev'],
  args: { onPick: fn(), onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByLabelText('page')
    field.focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith({
      kind: 'existing',
      database: DATABASES[0],
      mode: 'table',
    })
    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalled()
    await expect((field as HTMLTextAreaElement).value).toBe('/table')
    // Into the new step, down to `field`, ↵ adds one; ↵ on a field creates.
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(labels(canvasElement)).toEqual(['title', 'field', 'field'])
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await expect(args.onPick).toHaveBeenLastCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [{ name: 'field', type: 'text' }],
      recordsAre: 'pages',
      mode: 'table',
      chart: undefined,
    })
  },
}

// ── what a pick hands the host ─────────────────────────────────────────────────
//
// The frames above draw the picker; these say what leaves it. A wrong pick is the
// silent kind of wrong — the glass looked right, and a chart came out bucketed by
// record title — so each one asserts the WHOLE object, ids included.

const rowsOf = (root: HTMLElement) => [
  ...glassOf(root).querySelectorAll<HTMLElement>('[role="option"]'),
]
const footOf = (root: HTMLElement) => glassOf(root).querySelector('[data-part="foot"]')!.textContent

/** A click on a database row picks it, and the BLOCK's own mode rides along. */
export const PickExistingCarriesTheMode: Story = {
  tags: ['!dev'],
  args: { block: 'gallery', onPick: fn() },
  play: async ({ canvasElement, args }) => {
    await expect(glassOf(canvasElement).querySelector('[data-part="head-text"]')!.textContent).toBe(
      '/gallery'
    )
    await userEvent.click(rowsOf(canvasElement)[2])
    await expect(args.onPick).toHaveBeenCalledWith({
      kind: 'existing',
      database: DATABASES[1],
      mode: 'gallery',
    })
  },
}

/** The foot follows the selection: `↵ create` under `new`, `↵ view` on a database. */
export const FootFollowsTheSelection: Story = {
  tags: ['!dev'],
  play: async ({ canvasElement }) => {
    within(canvasElement).getByLabelText('page').focus()
    await expect(footOf(canvasElement)).toBe('named after this page↵ create')
    await userEvent.keyboard('{ArrowDown}')
    await expect(footOf(canvasElement)).toBe('↵ view')
    await userEvent.keyboard('{ArrowUp}')
    await expect(footOf(canvasElement)).toBe('named after this page↵ create')
  },
}

/**
 * Dismissal, and the field underneath. A press outside the glass closes and keeps
 * the typed text; a press ON the glass does not. ↑↓ ↵ esc are swallowed at the
 * document — if one reached the field, ↵ would commit a half-typed `/table`.
 */
export const DismissAndTheFieldUnderneath: Story = {
  tags: ['!dev'],
  args: { onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('page') as HTMLTextAreaElement
    field.focus()
    const reached = fn()
    field.addEventListener('keydown', reached)
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    await expect(reached).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalledTimes(1)
    await expect(field.value).toBe('/table')

    fireEvent.pointerDown(glassOf(canvasElement))
    await expect(args.onClose).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(document.body)
    await expect(args.onClose).toHaveBeenCalledTimes(2)
  },
}

/** The seg's choice rides the pick: `rows only` reaches the host as `recordsAre`. */
export const RowsOnlyRidesThePick: Story = {
  tags: ['!dev'],
  args: { onPick: fn() },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('page')
    field.focus()
    await userEvent.keyboard('{Enter}')
    const seg = glassOf(canvasElement).querySelector<HTMLElement>('[data-part="seg"]')!
    const opts = seg.querySelectorAll<HTMLElement>('[data-part="seg-opt"]')
    await userEvent.click(opts[1])
    // Pressing the pressed option again does not leave the seg with no choice —
    // an unpressed seg would send `recordsAre` as whatever the default was.
    await userEvent.click(opts[1])
    await expect(opts[1].getAttribute('aria-pressed')).toBe('true')
    await expect(opts[0].getAttribute('aria-pressed')).toBe('false')
    // The seg owns its own keys, so ↵ only creates once focus is back in the field.
    field.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [],
      recordsAre: 'rows',
      mode: 'table',
      chart: undefined,
    })
  },
}

/** ↵ on `field` adds a text field each time, named `field` then `field 2` — and
 *  both ride the pick. A second row called `field` would collide in the schema. */
export const FieldsAddUpAndAreNamed: Story = {
  tags: ['!dev'],
  args: { onPick: fn() },
  play: async ({ canvasElement, args }) => {
    within(canvasElement).getByLabelText('page').focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await expect(labels(canvasElement)).toEqual(['title', 'field', 'field'])
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(labels(canvasElement)).toEqual(['title', 'field', 'field 2', 'field'])
    await userEvent.keyboard('{ArrowUp}{Enter}')
    await expect(args.onPick).toHaveBeenLastCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [
        { name: 'field', type: 'text' },
        { name: 'field 2', type: 'text' },
      ],
      recordsAre: 'pages',
      mode: 'table',
      chart: undefined,
    })
  },
}

/** A pond with no database yet: the lone `new` row, and ↵ goes straight through. */
export const EmptyPond: Story = {
  tags: ['!dev'],
  args: { databases: [] },
  play: async ({ canvasElement }) => {
    within(canvasElement).getByLabelText('page').focus()
    await expect(groups(canvasElement)).toEqual(['new'])
    await expect(rowsOf(canvasElement)).toHaveLength(1)
    await userEvent.keyboard('{Enter}')
    await expect(glassOf(canvasElement).dataset.step).toBe('new')
  },
}

/**
 * A chart pick names the two fields the row's `sub` promised, BY ID — and a kind
 * taken off `all charts` reads the same pair a suggested one does. The board puts
 * the full list one row from the fits group, not in another world.
 */
export const ChartPickCarriesTheAxes: Story = {
  tags: ['!dev'],
  args: {
    block: 'chart',
    defaultStep: 'type',
    defaultSource: DATABASES[1],
    loadFields,
    onPick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    await waitFor(() => expect(rowsOf(canvasElement)).toHaveLength(4))
    within(canvasElement).getByLabelText('page').focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(args.onPick).toHaveBeenCalledWith({
      kind: 'existing',
      database: DATABASES[1],
      mode: 'chart',
      chart: { kind: 'area', xProperty: 'f-day', yProperty: 'f-kcal' },
    })

    await userEvent.click(rowsOf(canvasElement)[3])
    await waitFor(() => expect(groups(canvasElement)).toEqual(['all charts']))
    await userEvent.click(rowsOf(canvasElement)[CHART_KINDS.indexOf('sankey')])
    await expect(args.onPick).toHaveBeenLastCalledWith({
      kind: 'existing',
      database: DATABASES[1],
      mode: 'chart',
      chart: { kind: 'sankey', xProperty: 'f-day', yProperty: 'f-kcal' },
    })
  },
}

/** A source with no date + number pair suggests nothing — just `all charts`. */
export const NoFitsOffersAllCharts: Story = {
  tags: ['!dev'],
  args: { block: 'chart', loadFields },
  play: async ({ canvasElement }) => {
    await userEvent.click(rowsOf(canvasElement)[1]) // recipes — no fields
    await expect(glassOf(canvasElement).dataset.step).toBe('type')
    await waitFor(() => expect(labels(canvasElement)).toEqual(['all charts']))
    await expect(groups(canvasElement)).toEqual([])
    await expect(glassOf(canvasElement).querySelector('[data-part="rule"]')).toBeNull()
  },
}

/**
 * `/chart` on a NEW database defines it first, then picks the type, and the pick
 * carries both. A database being defined has no field IDS yet, so the pick is the
 * kind alone and the engine infers the axes — never an empty count series.
 */
export const NewDatabaseThenChartType: Story = {
  tags: ['!dev'],
  args: { block: 'chart', onPick: fn() },
  play: async ({ canvasElement, args }) => {
    within(canvasElement).getByLabelText('page').focus()
    await userEvent.keyboard('{Enter}')
    await expect(glassOf(canvasElement).dataset.step).toBe('new')
    await expect(footOf(canvasElement)).toBe('filed in databasesthis page gets a chart view')
    await userEvent.keyboard('{Enter}')
    await expect(glassOf(canvasElement).dataset.step).toBe('type')
    await expect(glassOf(canvasElement).querySelector('[data-part="head-text"]')!.textContent).toBe(
      '/chart › recipes'
    )
    await expect(labels(canvasElement)).toEqual(['all charts'])
    await userEvent.keyboard('{Enter}')
    await userEvent.click(rowsOf(canvasElement)[CHART_KINDS.indexOf('bar')])
    await expect(args.onPick).toHaveBeenCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [],
      recordsAre: 'pages',
      mode: 'chart',
      chart: { kind: 'bar' },
    })
  },
}
