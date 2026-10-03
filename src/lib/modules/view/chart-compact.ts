/**
 * The COMPACT inline presentation of the `chart` view mode (#259, child 228c of
 * #228) — the pure half. The React half is `collection-chart-compact.tsx`.
 *
 * `PondTemplate.dc.html` draws two chart marks inline on its template cards:
 * `bars` (the tracker's / dashboard's `by week`) and `heat` (the habit's `every
 * day`). ADR 0007 sorted both as *aggregations*, so neither is a block type —
 * `bars` is the existing `chart` mode at `kind: 'bar'`, and `heat` is the existing
 * `chart` mode at `kind: 'heatmap'` (ADR 0007 called `heat` "a new view mode"; it
 * is not — `heatmap` has been a `CHART_KINDS` member since #111, with its
 * aggregation in `heatmap-data.ts`). The one thing missing was the board's compact
 * drawing of each, which `chart.presentation: 'compact'` selects.
 *
 * Nothing here holds data. Both marks read the same `chartDataFromRows` output the
 * chart CARD reads — the bar strip takes `points`, the heat grid takes
 * `heatmap.cells` — and reduce it to the geometry the board draws. That is #111's
 * law ("the record is the source of truth… nothing holds a copy"), and it is why
 * these are presentations of a view mode and not the `heatmap` / chart blocks
 * #111 deleted.
 *
 * Which chart kind has a compact mark is an exhaustive table, not a switch: a
 * fourteenth chart kind is a compile error here, never a silent `null`.
 */
import { getHeatmapWeekStartSunday } from '@/components/charts/heatmap/heatmap-utils'
import type { ChartKind } from './aggregate'
import type { ViewBlock } from './schema'
import { isoDay, parseIsoDateLocal, type HeatmapCell } from './heatmap-data'

/** The board's two inline chart marks, in `PondTemplate.dc.html`'s own names. */
export const COMPACT_CHART_MARKS = ['bars', 'heat'] as const
export type CompactChartMark = (typeof COMPACT_CHART_MARKS)[number]

/**
 * Which chart KIND the compact presentation draws as which mark. Only two kinds
 * have one — the board draws no compact line, ring or gauge — so a view at
 * `presentation: 'compact'` on any other kind falls back to the card.
 */
export const COMPACT_CHART_MARK: Record<ChartKind, CompactChartMark | null> = {
  line: null,
  area: null,
  bar: 'bars',
  composed: null,
  net: null,
  heatmap: 'heat',
  ring: null,
  gauge: null,
  radar: null,
  scatter: null,
  sankey: null,
  sunburst: null,
  funnel: null,
}

/**
 * The compact mark a view block draws, or null when it draws the chart card: the
 * block must be in `chart` mode, at `presentation: 'compact'`, on a kind with a
 * mark. Read off the block alone — never an ancestor template (ADR 0005: a
 * template keeps no tie to the page made from it; the flag is persisted on the
 * block at instantiation, #261).
 */
export function compactChartMark(block: ViewBlock): CompactChartMark | null {
  if (block.mode !== 'chart') return null
  return compactMarkForChart(block.chart)
}

/**
 * Is this block the chart CARD — `PondChart`, which draws its own paper, shadow,
 * head and footer — rather than a compact mark inside a block card? The one
 * spelling of a question three places were asking (#227 review): the block frame
 * steps aside for it (`block-frame.ts`), the view routes its loading and error
 * states to it (`view.tsx`), and the renderer picks between the two presentations.
 * Three spellings that disagreed by a hair would put a card inside a card, which
 * is the thing #227 exists to remove.
 */
export function isChartCard(block: ViewBlock): boolean {
  return block.mode === 'chart' && compactChartMark(block) === null
}

/**
 * The same question asked of a chart config alone, for a caller that already knows
 * it is in `chart` mode and holds only the config — so it does not have to
 * fabricate a `ViewBlock` to reach the table (#259 review). `undefined` config, or
 * the default `card` presentation, or a kind the board draws no compact mark for,
 * all mean "draw the card".
 */
export function compactMarkForChart(
  chart: ViewBlock['chart'] | undefined
): CompactChartMark | null {
  if (!chart || chart.presentation !== 'compact') return null
  return COMPACT_CHART_MARK[chart.kind]
}

/**
 * How each mark is empty, per the board:
 *
 *   bars  `else Object.assign(b, { isVoid: true, voidText: v })` — the shared
 *         `voidBox` (72 high, radius 12, inset 1.4px ink .14, mono 11 / ink .68),
 *         drawn by the frame's `PondBlockEmpty` in its `void` box.
 *   heat  the grid itself: `on = filled && …`, so an empty heat draws all 84 cells
 *         at ink .07. No voidBox — the frame never takes this mark's empty state.
 */
export type CompactMarkEmpty = 'void' | 'grid'
export const COMPACT_MARK_EMPTY: Record<CompactChartMark, CompactMarkEmpty> = {
  bars: 'void',
  heat: 'grid',
}

// ── bars ─────────────────────────────────────────────────────────────────────

/** The board's `bars: { height: 72 }` — the strip's height, which the bars fill toward. */
export const BAR_STRIP_HEIGHT = 72

export interface StripBar {
  /** The bar's height as a PERCENT of the strip — `Math.round(h / mx * 100)`. */
  height: number
  /** The LAST bar: the current period, drawn at full ink (`i === v.length - 1 ? fg : a(.28)`). */
  current: boolean
}

/**
 * The board's bar rule, verbatim:
 *
 *   const mx = Math.max(...v)
 *   bar: { height: `${Math.round(h / mx * 100)}%`, background: i === v.length - 1 ? fg : a(.28) }
 *
 * Heights are normalised to the MAXIMUM, not a fixed ceiling, so the tallest bar
 * always fills the strip. Two readings the fixture never exercises are pinned: a
 * strip whose values are all zero (or negative — an aggregate can be) draws every
 * bar at 0 rather than dividing by zero, and a negative value draws at 0.
 */
export function barStrip(values: readonly number[]): StripBar[] {
  const mx = Math.max(0, ...values)
  return values.map((h, i) => ({
    height: mx > 0 ? Math.round((Math.max(0, h) / mx) * 100) : 0,
    current: i === values.length - 1,
  }))
}

// ── heat ─────────────────────────────────────────────────────────────────────

/** The board's grid: `repeat(12, …)` week columns × `repeat(7, auto)` day rows = 84 cells. */
export const HEAT_WEEKS = 12
export const HEAT_DAYS = 7
export const HEAT_CELLS = HEAT_WEEKS * HEAT_DAYS

/**
 * The board's three levels, and only three:
 *   `background: on ? (i > 71 ? fg : a(.45)) : a(.07)`
 * → `recent` full ink · `on` ink .45 · `off` ink .07.
 */
export type HeatLevel = 'off' | 'on' | 'recent'

export interface HeatCell {
  /** The calendar day, ISO `YYYY-MM-DD`. */
  date: string
  /** The day's aggregated figure (duplicate dates sum, as `toHeatmapGrid`). */
  value: number
  level: HeatLevel
}

/**
 * The 84 cells of the compact heat grid, in the order the board's
 * `grid-auto-flow: column` lays them out: WEEKS are columns and DAYS are rows, so
 * cells 0–6 are the oldest week Sunday→Saturday, and cells 77–83 the current week.
 * Get the flow wrong and the calendar transposes.
 *
 * The window is the twelve Sunday-start weeks ending with the week that holds
 * `today` (the GitHub-contributions convention `toHeatmapGrid` already uses), so a
 * habit not kept for three weeks shows three empty columns — the honest reading.
 * `today` is a parameter so the grid is deterministic under test.
 *
 * Levels come from the aggregation, never from the fixture: a day is `on` when its
 * figure is above zero; an `on` day in the CURRENT week is `recent` (the board's
 * `i > 71 ? fg`, read as "the most recent week" — the same rule as the bar strip's
 * last bar). The board's `((i * 37) % 11) > 3` is fixture noise and is not a rule.
 */
export function heatGrid(cells: readonly HeatmapCell[], today: Date = new Date()): HeatCell[] {
  const byDay = new Map<number, number>()
  for (const cell of cells) {
    const key = parseIsoDateLocal(cell.date).getTime()
    byDay.set(key, (byDay.get(key) ?? 0) + cell.value)
  }

  const lastSunday = getHeatmapWeekStartSunday(today)
  const grid: HeatCell[] = []
  for (let week = 0; week < HEAT_WEEKS; week++) {
    for (let day = 0; day < HEAT_DAYS; day++) {
      // Calendar stepping (setDate), never millisecond arithmetic — a DST week is
      // 167 or 169 hours long and would shear the columns.
      const date = new Date(lastSunday)
      date.setDate(date.getDate() - (HEAT_WEEKS - 1 - week) * 7 + day)
      const value = byDay.get(date.getTime()) ?? 0
      const on = value > 0
      const level: HeatLevel = on ? (week === HEAT_WEEKS - 1 ? 'recent' : 'on') : 'off'
      grid.push({ date: isoDay(date), value, level })
    }
  }
  return grid
}
