import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'

import { CollectionView } from './view'
import { PondBlock } from '@/components/organisms/PondBlock'
import { CHART_EMPTY_LINE } from '../chart/card'
import { POND_BLOCK_FILTERED_EMPTY_LINE } from '../block-frame'
import { BAR_STRIP_HEIGHT, HEAT_CELLS } from './chart-compact'
import type { CollectionRow } from './apply'
import type { ViewBlock, ViewChartConfig } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * The compact presentation of the `chart` view mode (#259) — the board's `bars`
 * strip and `heat` grid. The play functions assert the COMPUTED values against
 * `PondTemplate.dc.html`'s `renderVals()` (its frames render under a transform, so
 * the literals in that script are the source, never DOM geometry read off the board):
 *
 *   bars    flex · align-items flex-end · gap 5 · height 72
 *   bar     flex 1 · radius 3 · height round(h / max × 100)% · LAST bar full ink, rest ink .28
 *   heat    grid · repeat(12) columns · repeat(7, auto) rows · grid-auto-flow COLUMN · gap 3
 *   cell    width 100% · aspect-ratio 1 · radius 2 · full ink / ink .45 / ink .07
 *   voidBox height 72 · flex · center · center · radius 12 · inset 0 0 0 1.4px ink .14 ·
 *           mono 11 / ink .68 — the compact strip's empty state; heat has none
 *
 * Both themes: ink flips to paper and nothing else moves. Every figure is aggregated
 * from `rows` at render time — no story holds chart data.
 */

/** Storybook-only paper/ink decorator: flips the ambient role tokens via `.dark`. */
const inkTheme: Decorator = (Story) => (
  <div className="dark rounded-mn-inner bg-raw-ink p-mn-6">
    <Story />
  </div>
)

const meta = {
  title: 'Modules/View/Compact chart',
  component: CollectionView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CollectionView>

export default meta
type Story = StoryObj<typeof meta>

// ── Fixture: a "running"-shaped tracker ───────────────────────────────────────
const schema: PropertySchema = [
  { id: 'p-week', name: 'Week', type: 'text' },
  { id: 'p-day', name: 'Day', type: 'date' },
  { id: 'p-km', name: 'Distance', type: 'number' },
]

const r = (id: string, values: Record<string, unknown>): CollectionRow => ({
  id,
  title: id,
  values,
})

/** The board's `tracker › by week` fixture: `f: [9, 12, 10, 14, 13, 8, 15, 16, 12, 17, 15, 18]`. */
const BY_WEEK = [9, 12, 10, 14, 13, 8, 15, 16, 12, 17, 15, 18]
const barRows: CollectionRow[] = BY_WEEK.map((km, i) =>
  r(`w${i + 1}`, { 'p-week': `w${String(i + 1).padStart(2, '0')}`, 'p-km': km })
)

/** ISO `YYYY-MM-DD` for a local date `days` ago. */
function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Today is always in the current week (→ recent); 14 and 28 days ago are always two
// and four columns back (→ on); 100 days ago is outside the twelve-week window.
const heatRows: CollectionRow[] = [
  r('d0', { 'p-day': daysAgo(0), 'p-km': 5 }),
  r('d14', { 'p-day': daysAgo(14), 'p-km': 6 }),
  r('d28', { 'p-day': daysAgo(28), 'p-km': 4 }),
  r('d100', { 'p-day': daysAgo(100), 'p-km': 9 }),
]

const series: ViewChartConfig['series'] = [{ property: 'p-km', agg: 'sum' }]
const bars: ViewBlock = {
  id: 'v-bars',
  type: 'view',
  mode: 'chart',
  chart: { kind: 'bar', xProperty: 'p-week', series, presentation: 'compact' },
}
const heat: ViewBlock = {
  id: 'v-heat',
  type: 'view',
  mode: 'chart',
  chart: { kind: 'heatmap', xProperty: 'p-day', series, presentation: 'compact' },
}

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

// ── bars ──────────────────────────────────────────────────────────────────────

async function assertBars(canvasElement: HTMLElement, theme: Theme) {
  const strip = canvasElement.querySelector<HTMLElement>('[data-part="bars"]')!
  await expect(strip).toBeTruthy()
  const ss = getComputedStyle(strip)
  // bars: flex · flex-end · gap 5 · height 72
  await expect(ss.display).toBe('flex')
  await expect(ss.alignItems).toBe('flex-end')
  await expect(ss.columnGap).toBe('5px')
  await expect(ss.height).toBe(`${BAR_STRIP_HEIGHT}px`)

  const bars = Array.from(strip.querySelectorAll<HTMLElement>('[data-part="bar"]'))
  await expect(bars).toHaveLength(BY_WEEK.length)
  const max = Math.max(...BY_WEEK)
  for (const [i, bar] of bars.entries()) {
    const bs = getComputedStyle(bar)
    // bar: flex 1 · radius 3 · height round(h / max × 100)%
    await expect(bs.flexGrow).toBe('1')
    await expect(bs.borderTopLeftRadius).toBe('3px')
    const pct = Math.round((BY_WEEK[i] / max) * 100)
    await expect(bar.style.height).toBe(`${pct}%`)
    await expect(parseFloat(bs.height)).toBeCloseTo((BAR_STRIP_HEIGHT * pct) / 100, 0)
    // LAST bar full ink; the rest ink .28
    if (i === bars.length - 1) {
      await expect(bs.backgroundColor).toBe(theme.ink)
    } else {
      await expect(alphaOf(bs.backgroundColor)).toBeCloseTo(0.28, 2)
    }
  }
  // The tallest bar (18, the last) fills the strip exactly.
  await expect(getComputedStyle(bars[bars.length - 1]).height).toBe(`${BAR_STRIP_HEIGHT}px`)
  // No chart-card chrome: no axes, no legend, no SVG.
  await expect(canvasElement.querySelector('svg')).toBeNull()
}

export const Bars: Story = {
  args: { config: bars, schema, rows: barRows },
  play: async ({ canvasElement }) => assertBars(canvasElement, LIGHT),
}

export const BarsInk: Story = {
  args: { config: bars, schema, rows: barRows },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertBars(canvasElement, DARK),
}

/** The board's voidBox: 72 high, radius 12, a 1.4px inset hairline at ink .14, one mono line. */
async function assertVoid(box: HTMLElement, theme: Theme, line: string) {
  await expect(box.dataset.emptyBox).toBe('void')
  const bs = getComputedStyle(box)
  // The voidBox stands exactly as tall as the strip it stands in for.
  await expect(bs.height).toBe(`${BAR_STRIP_HEIGHT}px`)
  await expect(bs.display).toBe('flex')
  await expect(bs.alignItems).toBe('center')
  await expect(bs.justifyContent).toBe('center')
  await expect(bs.borderTopLeftRadius).toBe('12px')
  // inset 0 0 0 1.4px a(.14) — the one painted shadow layer is an inset ring.
  await expect(bs.boxShadow).toContain('inset')
  await expect(bs.boxShadow).toMatch(/1\.4px/)
  const ring = bs.boxShadow
    .split(/,(?![^(]*\))/)
    .map((l) => l.trim())
    .find((l) => l.includes('inset'))!
  await expect(
    alphaOf(ring.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\))/)![0])
  ).toBeCloseTo(0.14, 2)
  // No ground, no padding: a hole, not a box.
  await expect(alphaOf(bs.backgroundColor)).toBe(0)
  // One line, mono 11 at ink .68, and no action.
  await expect(box.children).toHaveLength(1)
  const text = box.firstElementChild as HTMLElement
  await expect(text.textContent).toBe(line)
  const ts = getComputedStyle(text)
  await expect(ts.fontFamily).toContain('Mono')
  await expect(ts.fontSize).toBe('11px')
  await expect(ts.color).toBe(theme.ink68)
  await expect(box.querySelector('button')).toBeNull()
}

async function assertBarsEmpty(canvasElement: HTMLElement, theme: Theme) {
  await expect(canvasElement.querySelector('[data-part="bars"]')).toBeNull()
  const box = canvasElement.querySelector<HTMLElement>('[data-part="empty"]')!
  await expect(box).toBeTruthy()
  await assertVoid(box, theme, CHART_EMPTY_LINE)
}

/** Empty: the voidBox through `PondBlockEmpty`, with the chart's own line. */
export const BarsEmpty: Story = {
  args: { config: bars, schema, rows: [] },
  play: async ({ canvasElement }) => assertBarsEmpty(canvasElement, LIGHT),
}

export const BarsEmptyInk: Story = {
  args: { config: bars, schema, rows: [] },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertBarsEmpty(canvasElement, DARK),
}

/**
 * The strip's empty state as the FRAME draws it on a page (BlockCanvas hands
 * `PondBlock` `emptyBox="void"` for a compact bar strip): the void box spans the
 * card's content box under the `by week` eyebrow.
 */
export const BarsEmptyInFrame: Story = {
  args: { config: bars, schema, rows: [] },
  render: () => (
    <PondBlock
      kind="table"
      heading="by week"
      state="empty"
      emptyBox="void"
      emptyLine={CHART_EMPTY_LINE}
    >
      <CollectionView config={bars} schema={schema} rows={[]} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind="table"]')!
    await expect(card.dataset.blockState).toBe('empty')
    const box = card.querySelector<HTMLElement>('[data-part="empty"]')!
    await assertVoid(box, LIGHT, CHART_EMPTY_LINE)
    const cs = getComputedStyle(card)
    const content = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    await expect(parseFloat(getComputedStyle(box).width)).toBeCloseTo(content, 0)
  },
}

// ── heat ──────────────────────────────────────────────────────────────────────

async function assertHeatGrid(canvasElement: HTMLElement) {
  const grid = canvasElement.querySelector<HTMLElement>('[data-part="heat"]')!
  await expect(grid).toBeTruthy()
  const gs = getComputedStyle(grid)
  // heat: grid · 12 columns · 7 rows · COLUMN flow · gap 3
  await expect(gs.display).toBe('grid')
  await expect(gs.gridAutoFlow).toBe('column')
  await expect(gs.gridTemplateColumns.split(' ')).toHaveLength(12)
  await expect(gs.gridTemplateRows.split(' ')).toHaveLength(7)
  await expect(gs.columnGap).toBe('3px')
  await expect(gs.rowGap).toBe('3px')

  // The grid carries its reading as an accessible name — and no cell carries a `title`
  // tooltip: a hover readout is an affordance, and no board draws one on these marks.
  await expect(grid.getAttribute('aria-label')).toContain('the last twelve weeks')

  const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-part="cell"]'))
  await expect(cells).toHaveLength(HEAT_CELLS)
  await expect(cells).toHaveLength(84)
  await expect(cells.filter((c) => c.title !== '')).toHaveLength(0)
  for (const cell of cells) {
    const cs = getComputedStyle(cell)
    // cell: width 100% · aspect 1 · radius 2
    await expect(cs.borderTopLeftRadius).toBe('2px')
    await expect(cs.aspectRatio).toBe('1 / 1')
    const rect = cell.getBoundingClientRect()
    await expect(rect.width).toBeCloseTo(rect.height, 0)
  }
  // Column flow: cells 0–6 share one column (same x); cell 7 starts the next.
  const x = (i: number) => cells[i].getBoundingClientRect().left
  await expect(x(0)).toBeCloseTo(x(6), 0)
  await expect(x(7)).toBeGreaterThan(x(6))
  const y = (i: number) => cells[i].getBoundingClientRect().top
  await expect(y(0)).toBeCloseTo(y(7), 0)
  await expect(y(6)).toBeGreaterThan(y(0))
  return cells
}

async function assertHeat(canvasElement: HTMLElement, theme: Theme) {
  const cells = await assertHeatGrid(canvasElement)
  // Three levels only: full ink in the current week, .45 earlier, .07 off.
  const recent = cells.filter((c) => c.dataset.level === 'recent')
  const on = cells.filter((c) => c.dataset.level === 'on')
  const off = cells.filter((c) => c.dataset.level === 'off')
  await expect(recent).toHaveLength(1) // today
  await expect(on).toHaveLength(2) // 14 and 28 days ago; 100 days ago is outside the window
  await expect(off).toHaveLength(81)
  for (const c of recent) await expect(getComputedStyle(c).backgroundColor).toBe(theme.ink)
  for (const c of on)
    await expect(alphaOf(getComputedStyle(c).backgroundColor)).toBeCloseTo(0.45, 2)
  for (const c of off)
    await expect(alphaOf(getComputedStyle(c).backgroundColor)).toBeCloseTo(0.07, 2)
  // The recent cell is in the LAST column.
  const lastColumnLeft = cells[83].getBoundingClientRect().left
  await expect(recent[0].getBoundingClientRect().left).toBeCloseTo(lastColumnLeft, 0)
}

export const Heat: Story = {
  args: { config: heat, schema, rows: heatRows },
  play: async ({ canvasElement }) => assertHeat(canvasElement, LIGHT),
}

export const HeatInk: Story = {
  args: { config: heat, schema, rows: heatRows },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertHeat(canvasElement, DARK),
}

/** Empty: NO voidBox — the grid itself, all 84 cells at ink .07. */
async function assertHeatEmpty(canvasElement: HTMLElement) {
  await expect(canvasElement.querySelector('[data-part="empty"]')).toBeNull()
  const cells = await assertHeatGrid(canvasElement)
  for (const c of cells) {
    await expect(c.dataset.level).toBe('off')
    await expect(alphaOf(getComputedStyle(c).backgroundColor)).toBeCloseTo(0.07, 2)
  }
}

export const HeatEmpty: Story = {
  args: { config: heat, schema, rows: [] },
  play: async ({ canvasElement }) => assertHeatEmpty(canvasElement),
}

export const HeatEmptyInk: Story = {
  args: { config: heat, schema, rows: [] },
  decorators: [inkTheme],
  play: async ({ canvasElement }) => assertHeatEmpty(canvasElement),
}

/**
 * The strip's OTHER empty sentence: rows exist but the filter hides them all, so the
 * same voidBox carries the filter's line — `no data yet` would be false about the
 * collection, and neither line is ever offered an action.
 */
export const BarsFilteredEmptyInFrame: Story = {
  args: { config: bars, schema, rows: [] },
  render: () => (
    <PondBlock
      kind="table"
      heading="by week"
      state="empty"
      emptyBox="void"
      emptyLine={POND_BLOCK_FILTERED_EMPTY_LINE}
    >
      <CollectionView config={bars} schema={schema} rows={[]} />
    </PondBlock>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-block-kind="table"]')!
    await expect(card.dataset.blockState).toBe('empty')
    const box = card.querySelector<HTMLElement>('[data-part="empty"]')!
    await assertVoid(box, LIGHT, POND_BLOCK_FILTERED_EMPTY_LINE)
    await expect(box.textContent).not.toBe(CHART_EMPTY_LINE)
  },
}
