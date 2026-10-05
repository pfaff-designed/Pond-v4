import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'

import { CollectionView } from './view'
import { PondBlock } from '@/components/organisms/PondBlock'
import { blockEmptyBox, blockFrame, GANTT_EMPTY_LINE } from '@/lib/modules/block-frame'
import { GANTT_TICK_COUNT } from './gantt-shared'
import type { CollectionRow } from './apply'
import type { ViewBlock } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * The three view modes #260 mapped into their `PondBlock` cards — `gallery`, `gantt`
 * and `big-number` — asserted on COMPUTED values against `PondTemplate.dc.html`'s
 * `renderVals()` (its frames render under a transform, so the literals in that script
 * are the source, never DOM geometry read off the board):
 *
 *   gallery  grid · repeat(3) · gap 10 — gcard column gap 6 · tile 64 / radius 12 / ink .07 ·
 *            title 13.5 / 500 full ink · meta mono 10.5 / ink .68 · every record a card
 *   gantt    gHead grid 120px · gap 10 · pb 6 · 1px ink .09 — gRow 1px ink .055 (two values)
 *            · gTick mono 10 / ink .68, four of them · gTrack 18 high, 25% gridlines ·
 *            bar top/bottom 4 (→ 10 high) · radius 4 · done ink .22 / live full ink
 *            · empty → the shared voidBox through PondBlockEmpty
 *   number   52 / 700 / -.03em / line-height .95 / tabular-nums (ADR 0004 §5) ·
 *            sub mono 11 / ink .68 · gap 6 · `—` at ink .68
 *
 * Both themes: ink flips to paper and nothing else moves. The in-card stories go
 * through `blockFrame()`, so they also pin the MAPPING: kind, width, eyebrow, note.
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Modules/View/Mapped modes',
  component: CollectionView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CollectionView>

export default meta
type Story = StoryObj<typeof meta>

// ── Themes ────────────────────────────────────────────────────────────────────
const LIGHT = { ink: 'rgb(27, 29, 20)', ink68: 'rgba(27, 29, 20, 0.68)' }
const DARK = { ink: 'rgb(250, 249, 239)', ink68: 'rgba(250, 249, 239, 0.68)' }
type Theme = typeof LIGHT

/** The alpha of a computed colour — `rgba(…, a)`, `color(srgb … / a)` or `oklab(… / a)`. */
function alphaOf(color: string): number {
  if (/^rgb\(/.test(color) && !color.includes('/')) return 1
  const m = color.match(/(?:\/|,)\s*([\d.]+%?)\s*\)\s*$/)
  if (!m) return NaN
  return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
}

const r = (id: string, title: string, values: Record<string, unknown>): CollectionRow => ({
  id,
  title,
  values,
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** The collection template's `records`: `[['monstera', 'water weekly'], …]` — and more. */
const plantSchema: PropertySchema = [{ id: 'p-care', name: 'Care', type: 'text' }]
const PLANTS: [string, string][] = [
  ['monstera', 'water weekly'],
  ['snake plant', 'every 3 weeks'],
  ['fiddle leaf', 'no draughts'],
  ['pothos', 'bright shade'],
  ['calathea', 'mist daily'],
]
const plantRows = PLANTS.map(([t, m], i) => r(`p${i}`, t, { 'p-care': m }))
const gallery: ViewBlock = { id: 'v-gallery', type: 'view', mode: 'gallery', label: 'records' }

/** The project template's `tasks — timeline`: `['book the van', 0, 8, 1]` … over 28 days. */
const taskSchema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do' },
      { id: 'o-doing', label: 'Doing' },
      { id: 'o-done', label: 'Done' },
    ],
  },
  { id: 'p-start', name: 'Start', type: 'date' },
  { id: 'p-due', name: 'Due', type: 'date' },
]
const taskRows: CollectionRow[] = [
  r('t1', 'book the van', { 'p-status': 'o-done', 'p-start': '2026-10-20', 'p-due': '2026-10-22' }),
  r('t2', 'cancel broadband', {
    'p-status': 'o-done',
    'p-start': '2026-10-21',
    'p-due': '2026-10-23',
  }),
  r('t3', 'sort the loft', {
    'p-status': 'o-doing',
    'p-start': '2026-10-25',
    'p-due': '2026-11-03',
  }),
  r('t4', 'pack the kitchen', {
    'p-status': 'o-todo',
    'p-start': '2026-11-01',
    'p-due': '2026-11-10',
  }),
  r('t5', 'meter readings', {
    'p-status': 'o-todo',
    'p-start': '2026-11-14',
    'p-due': '2026-11-16',
  }),
]
const gantt: ViewBlock = { id: 'v-gantt', type: 'view', mode: 'gantt', label: 'tasks — timeline' }

/** The tracker's `this week`: `['18.4 km', '3 runs']` — summed from three runs. */
const runSchema: PropertySchema = [{ id: 'p-km', name: 'Distance', type: 'number' }]
const runRows = [
  r('a', 'tue', { 'p-km': 5.2 }),
  r('b', 'thu', { 'p-km': 6 }),
  r('c', 'sat', { 'p-km': 7.2 }),
]
const figure: ViewBlock = {
  id: 'v-number',
  type: 'view',
  mode: 'big-number',
  label: 'this week',
  bigNumber: { property: 'p-km', agg: 'sum' },
}

// ── gallery ───────────────────────────────────────────────────────────────────

async function assertGallery(canvasElement: HTMLElement, theme: Theme) {
  const grid = canvasElement.querySelector<HTMLElement>('[data-part="gallery"]')!
  await expect(grid).toBeTruthy()
  const gs = getComputedStyle(grid)
  // gallery: grid · repeat(3) · gap 10
  await expect(gs.display).toBe('grid')
  await expect(gs.gridTemplateColumns.split(' ')).toHaveLength(3)
  await expect(gs.columnGap).toBe('10px')
  await expect(gs.rowGap).toBe('10px')

  // Every record is a card — five here, past the preview's three.
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-part="gallery-card"]'))
  await expect(cards).toHaveLength(PLANTS.length)
  await expect(cards.length).toBeGreaterThan(3)

  for (const [i, card] of cards.entries()) {
    const cs = getComputedStyle(card)
    // gcard: column · gap 6
    await expect(cs.display).toBe('flex')
    await expect(cs.flexDirection).toBe('column')
    await expect(cs.rowGap).toBe('6px')
    // img: block · 64 high · radius 12 · ink .07 ground
    const img = card.querySelector<HTMLElement>('[data-part="gallery-image"]')!
    const is = getComputedStyle(img)
    await expect(is.display).toBe('block')
    await expect(is.height).toBe('64px')
    await expect(is.borderTopLeftRadius).toBe('12px')
    await expect(alphaOf(is.backgroundColor)).toBeCloseTo(0.07, 2)
    // tStyle: 13.5 / 500 / full ink
    const title = card.querySelector<HTMLElement>('[data-part="gallery-title"]')!
    const ts = getComputedStyle(title)
    await expect(title.textContent).toBe(PLANTS[i][0])
    await expect(ts.fontSize).toBe('13.5px')
    await expect(ts.fontWeight).toBe('500')
    await expect(ts.color).toBe(theme.ink)
    // mStyle: mono 10.5 / ink .68
    const metaEl = card.querySelector<HTMLElement>('[data-part="gallery-meta"]')!
    const ms = getComputedStyle(metaEl)
    await expect(metaEl.textContent).toBe(PLANTS[i][1])
    await expect(ms.fontFamily).toContain('Mono')
    await expect(ms.fontSize).toBe('10.5px')
    await expect(ms.color).toBe(theme.ink68)
  }
  // Three per row: the fourth card sits under the first.
  const x = (i: number) => cards[i].getBoundingClientRect().left
  const y = (i: number) => cards[i].getBoundingClientRect().top
  await expect(x(3)).toBeCloseTo(x(0), 0)
  await expect(y(3)).toBeGreaterThan(y(0))
}

export const Gallery: Story = {
  args: { config: gallery, schema: plantSchema, rows: plantRows },
  play: async ({ canvasElement }) => assertGallery(canvasElement, LIGHT),
}

export const GalleryInk: Story = {
  args: { config: gallery, schema: plantSchema, rows: plantRows },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertGallery(canvasElement, DARK),
}

/** The mapping: `blockFrame()` sends a gallery view to the 580 `gallery` card, its label the eyebrow. */
export const GalleryInCard: Story = {
  args: { config: gallery, schema: plantSchema, rows: plantRows },
  render: () => (
    <PondBlock {...blockFrame(gallery)!}>
      <CollectionView config={gallery} schema={plantSchema} rows={plantRows} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('gallery')
    // ADR 0008: the card fills its container, not the board's old 580px.
    const p = card.parentElement!
    const pcs = getComputedStyle(p)
    const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
    await expect(card.getBoundingClientRect().width).toBeCloseTo(avail, 0)
    await expect(card.querySelector('span')!.textContent).toBe('records')
    await assertGallery(canvasElement, LIGHT)
  },
}

// ── gantt ─────────────────────────────────────────────────────────────────────

/** `inset 0 0 0 1.4px a(.14)` — one painted layer, an inset ring at ink .14. */
async function assertVoid(box: HTMLElement, theme: Theme, line: string) {
  await expect(box.dataset.emptyBox).toBe('void')
  const bs = getComputedStyle(box)
  await expect(bs.height).toBe('72px')
  await expect(bs.display).toBe('flex')
  await expect(bs.alignItems).toBe('center')
  await expect(bs.justifyContent).toBe('center')
  await expect(bs.borderTopLeftRadius).toBe('12px')
  await expect(bs.boxShadow).toContain('inset')
  await expect(bs.boxShadow).toMatch(/1\.4px/)
  const ring = bs.boxShadow
    .split(/,(?![^(]*\))/)
    .map((l) => l.trim())
    .find((l) => l.includes('inset'))!
  await expect(
    alphaOf(ring.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\))/)![0])
  ).toBeCloseTo(0.14, 2)
  await expect(alphaOf(bs.backgroundColor)).toBe(0)
  await expect(box.children).toHaveLength(1)
  const text = box.firstElementChild as HTMLElement
  await expect(text.textContent).toBe(line)
  const ts = getComputedStyle(text)
  await expect(ts.fontFamily).toContain('Mono')
  await expect(ts.fontSize).toBe('11px')
  await expect(ts.color).toBe(theme.ink68)
  await expect(box.querySelector('button')).toBeNull()
}

async function assertGantt(canvasElement: HTMLElement, theme: Theme) {
  // gHead: grid · 120px label column · gap 10 · pb 6 · 1px solid ink .09
  const head = canvasElement.querySelector<HTMLElement>('[data-part="gantt-head"]')!
  await expect(head).toBeTruthy()
  const hs = getComputedStyle(head)
  await expect(hs.display).toBe('grid')
  await expect(hs.gridTemplateColumns.split(' ')[0]).toBe('120px')
  await expect(hs.columnGap).toBe('10px')
  await expect(hs.paddingBottom).toBe('6px')
  await expect(hs.borderBottomWidth).toBe('1px')
  await expect(hs.borderBottomStyle).toBe('solid')
  await expect(alphaOf(hs.borderBottomColor)).toBeCloseTo(0.09, 2)

  // gTicks: four cells; gTick: mono 10 / ink .68, the board's `20 oct` form
  const ticks = canvasElement.querySelector<HTMLElement>('[data-part="gantt-ticks"]')!
  await expect(getComputedStyle(ticks).gridTemplateColumns.split(' ')).toHaveLength(4)
  const tickEls = Array.from(ticks.querySelectorAll<HTMLElement>('[data-part="gantt-tick"]'))
  await expect(tickEls).toHaveLength(GANTT_TICK_COUNT)
  await expect(tickEls.map((t) => t.textContent)).toEqual(['20 oct', '27 oct', '3 nov', '10 nov'])
  for (const t of tickEls) {
    const ts = getComputedStyle(t)
    await expect(ts.fontFamily).toContain('Mono')
    await expect(ts.fontSize).toBe('10px')
    await expect(ts.color).toBe(theme.ink68)
  }

  // gRow: grid · 120px · gap 10 · centred · 4px 0 · 1px solid ink .055 — NOT the head's .09
  const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-part="gantt-row"]'))
  await expect(rows).toHaveLength(taskRows.length)
  for (const row of rows) {
    const rs = getComputedStyle(row)
    await expect(rs.display).toBe('grid')
    await expect(rs.gridTemplateColumns.split(' ')[0]).toBe('120px')
    await expect(rs.columnGap).toBe('10px')
    await expect(rs.alignItems).toBe('center')
    await expect(rs.paddingTop).toBe('4px')
    await expect(rs.paddingBottom).toBe('4px')
    await expect(rs.borderBottomWidth).toBe('1px')
    await expect(alphaOf(rs.borderBottomColor)).toBeCloseTo(0.055, 3)
    // gTrack: 18 high, a 1px gridline every 25%
    const track = row.querySelector<HTMLElement>('[data-part="gantt-track"]')!
    const trs = getComputedStyle(track)
    await expect(trs.position).toBe('relative')
    await expect(trs.height).toBe('18px')
    await expect(trs.backgroundSize).toBe('25% 100%')
    await expect(trs.backgroundImage).toContain('linear-gradient')
    // bar: absolute · top/bottom 4 (→ 10 high in an 18 track) · radius 4 · %-positioned
    const bar = row.querySelector<HTMLElement>('[data-part="gantt-bar"]')!
    const bs = getComputedStyle(bar)
    await expect(bs.position).toBe('absolute')
    await expect(bs.top).toBe('4px')
    await expect(bs.bottom).toBe('4px')
    await expect(bs.height).toBe('10px')
    await expect(bs.borderTopLeftRadius).toBe('4px')
    await expect(bar.style.left).toMatch(/%$/)
    await expect(bar.style.width).toMatch(/%$/)
  }
  // Two hairlines, two values.
  await expect(alphaOf(getComputedStyle(rows[0]).borderBottomColor)).not.toBeCloseTo(
    alphaOf(hs.borderBottomColor),
    2
  )

  // The board's two inks: done bars ink .22 under an ink-.68 label; live bars and labels full ink.
  const bars = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-part="gantt-bar"]'))
  const labels = Array.from(
    canvasElement.querySelectorAll<HTMLElement>('[data-part="gantt-label"]')
  )
  await expect(labels.map((l) => l.textContent)).toEqual(taskRows.map((t) => t.title))
  for (const [i, bar] of bars.entries()) {
    const done = i < 2
    await expect('done' in bar.dataset).toBe(done)
    const ls = getComputedStyle(labels[i])
    await expect(ls.fontSize).toBe('12px')
    await expect(ls.overflow).toBe('hidden')
    await expect(ls.textOverflow).toBe('ellipsis')
    await expect(ls.whiteSpace).toBe('nowrap')
    if (done) {
      await expect(alphaOf(getComputedStyle(bar).backgroundColor)).toBeCloseTo(0.22, 2)
      await expect(ls.color).toBe(theme.ink68)
    } else {
      await expect(getComputedStyle(bar).backgroundColor).toBe(theme.ink)
      await expect(ls.color).toBe(theme.ink)
    }
  }
  // The first bar starts at the range start; the last ends at its end.
  await expect(bars[0].style.left).toBe('0%')
  const last = bars[bars.length - 1]
  await expect(parseFloat(last.style.left) + parseFloat(last.style.width)).toBeCloseTo(100, 5)
}

export const Gantt: Story = {
  args: { config: gantt, schema: taskSchema, rows: taskRows },
  play: async ({ canvasElement }) => assertGantt(canvasElement, LIGHT),
}

export const GanttInk: Story = {
  args: { config: gantt, schema: taskSchema, rows: taskRows },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertGantt(canvasElement, DARK),
}

/** The mapping: a gantt view stays in the 500 `table` card (no gantt kind in PondBlock.dc.html). */
export const GanttInCard: Story = {
  args: { config: gantt, schema: taskSchema, rows: taskRows },
  render: () => (
    <PondBlock {...blockFrame(gantt)!}>
      <CollectionView config={gantt} schema={taskSchema} rows={taskRows} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('table')
    // ADR 0008: the card fills its container, not the board's old 500px.
    const p = card.parentElement!
    const pcs = getComputedStyle(p)
    const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
    await expect(card.getBoundingClientRect().width).toBeCloseTo(avail, 0)
    await expect(card.querySelector('span')!.textContent).toBe('tasks — timeline')
    await assertGantt(canvasElement, LIGHT)
  },
}

/** Rows but nothing dated: the shared voidBox with the gantt's own line, no action. */
async function assertGanttEmpty(canvasElement: HTMLElement, theme: Theme) {
  await expect(canvasElement.querySelector('[data-part="gantt-row"]')).toBeNull()
  const box = canvasElement.querySelector<HTMLElement>('[data-part="empty"]')!
  await expect(box).toBeTruthy()
  await assertVoid(box, theme, GANTT_EMPTY_LINE)
}

const undated = [r('u1', 'someday idea', { 'p-status': 'o-todo' })]

export const GanttEmpty: Story = {
  args: { config: gantt, schema: taskSchema, rows: undated },
  play: async ({ canvasElement }) => assertGanttEmpty(canvasElement, LIGHT),
}

export const GanttEmptyInk: Story = {
  args: { config: gantt, schema: taskSchema, rows: undated },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertGanttEmpty(canvasElement, DARK),
}

/**
 * An EMPTY collection as the frame draws it: BlockCanvas hands `PondBlock` the
 * void box (`blockEmptyBox` → `void`) and the template's line, spanning the card.
 */
export const GanttEmptyInFrame: Story = {
  args: { config: gantt, schema: taskSchema, rows: [] },
  render: () => (
    <PondBlock
      {...blockFrame(gantt)!}
      state="empty"
      emptyBox={blockEmptyBox(gantt)}
      emptyLine={GANTT_EMPTY_LINE}
    >
      <CollectionView config={gantt} schema={taskSchema} rows={[]} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind="table"]')!
    await expect(card.dataset.blockState).toBe('empty')
    const box = card.querySelector<HTMLElement>('[data-part="empty"]')!
    await assertVoid(box, LIGHT, GANTT_EMPTY_LINE)
    const cs = getComputedStyle(card)
    const content = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    await expect(parseFloat(getComputedStyle(box).width)).toBeCloseTo(content, 0)
  },
}

// ── number ────────────────────────────────────────────────────────────────────

async function assertNumber(canvasElement: HTMLElement, theme: Theme) {
  const wrap = canvasElement.querySelector<HTMLElement>('[data-part="number"]')!
  await expect(wrap).toBeTruthy()
  const ws = getComputedStyle(wrap)
  // numWrap: column · gap 6
  await expect(ws.display).toBe('flex')
  await expect(ws.flexDirection).toBe('column')
  await expect(ws.rowGap).toBe('6px')
  await expect(wrap.children).toHaveLength(2)

  // bigStyle: 52 / 700 / -.03em / .95 / tabular-nums / full ink
  const big = wrap.querySelector<HTMLElement>('[role="status"]')!
  await expect(big.getAttribute('aria-label')).toBe('Distance: 18.4')
  await expect(big.textContent).toBe('18.4')
  const bs = getComputedStyle(big)
  await expect(bs.fontSize).toBe('52px')
  await expect(bs.fontWeight).toBe('700')
  await expect(parseFloat(bs.letterSpacing)).toBeCloseTo(-0.03 * 52, 2)
  await expect(parseFloat(bs.lineHeight)).toBeCloseTo(0.95 * 52, 1)
  await expect(bs.fontVariantNumeric).toBe('tabular-nums')
  await expect(bs.color).toBe(theme.ink)
  await expect(bs.fontFamily).not.toContain('Mono')

  // sub: mono 11 / ink .68
  const sub = wrap.querySelector<HTMLElement>('[data-part="sub"]')!
  await expect(sub.textContent).toBe('Distance · over 3 records')
  const ss = getComputedStyle(sub)
  await expect(ss.fontFamily).toContain('Mono')
  await expect(ss.fontSize).toBe('11px')
  await expect(ss.color).toBe(theme.ink68)
}

export const Number: Story = {
  args: { config: figure, schema: runSchema, rows: runRows },
  play: async ({ canvasElement }) => assertNumber(canvasElement, LIGHT),
}

export const NumberInk: Story = {
  args: { config: figure, schema: runSchema, rows: runRows },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertNumber(canvasElement, DARK),
}

/** The mapping: a big-number view is the 400 `number` card, its label the eyebrow, no note. */
export const NumberInCard: Story = {
  args: { config: figure, schema: runSchema, rows: runRows },
  render: () => (
    <PondBlock {...blockFrame(figure)!}>
      <CollectionView config={figure} schema={runSchema} rows={runRows} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind]')!
    await expect(card.dataset.blockKind).toBe('number')
    // ADR 0008: the card fills its container, not the board's old 400px.
    const p = card.parentElement!
    const pcs = getComputedStyle(p)
    const avail = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)
    await expect(card.getBoundingClientRect().width).toBeCloseTo(avail, 0)
    await expect(card.querySelector('span')!.textContent).toBe('this week')
    await assertNumber(canvasElement, LIGHT)
  },
}

/** Nothing to read: `color: filled ? fg : a(.68)` — the em dash sits on the third tier. */
async function assertNumberEmpty(canvasElement: HTMLElement, theme: Theme) {
  const big = canvasElement.querySelector<HTMLElement>('[role="status"]')!
  await expect(big.textContent).toBe('—')
  const bs = getComputedStyle(big)
  await expect(bs.fontSize).toBe('52px')
  await expect(bs.fontWeight).toBe('700')
  await expect(bs.color).toBe(theme.ink68)
  const sub = canvasElement.querySelector<HTMLElement>('[data-part="sub"]')!
  await expect(sub.textContent).toBe('Distance (avg) · over 1 record')
}

const noValues: ViewBlock = {
  ...figure,
  id: 'v-number-empty',
  bigNumber: { property: 'p-km', agg: 'avg' },
}
const blankRow = [r('x', 'rest day', {})]

export const NumberNoValues: Story = {
  args: { config: noValues, schema: runSchema, rows: blankRow },
  play: async ({ canvasElement }) => assertNumberEmpty(canvasElement, LIGHT),
}

export const NumberNoValuesInk: Story = {
  args: { config: noValues, schema: runSchema, rows: blankRow },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertNumberEmpty(canvasElement, DARK),
}
