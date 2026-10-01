import { z } from 'zod'

/**
 * Shared chart DATA contract — the point-major shape the Bklit visuals are fed from.
 * Deliberately NOT the flat `Record<string,unknown>[]` they consume internally: that
 * shape is wide and positional. Instead each point pairs an x-label with a
 * `{ seriesName: number }` map, and `toChartRows` transforms it into Bklit's row shape
 * at the renderer — the module boundary owns the mapping.
 *
 * #111 deleted the three standalone chart BLOCKS this contract was written for. It
 * survives as the seam between the `chart` view mode's aggregation
 * (`view/chart-data.ts`, which emits exactly this shape) and the Bklit renderers.
 */

/**
 * One data point: an x-axis label plus a map of series-name → numeric value. A
 * missing series at a point is simply absent from `values` (rendered as a gap, not
 * zero). For the time-series kinds (line, area) `x` SHOULD be a date-parseable string
 * ("2026-01", "2026-01-15") so the axis reads chronologically; for the categorical
 * kinds `x` is any category label.
 */
export const chartPointSchema = z.object({
  x: z.string(),
  values: z.record(z.string(), z.number()),
})
export type ChartPoint = z.infer<typeof chartPointSchema>

/** The fields every chart module shares, minus `id` and the `type` literal. */
export const chartBaseShape = {
  /** Optional card title, shown as a kicker above the chart. */
  title: z.string().optional(),
  /** Optional one-line caption under the title (scope, units, timeframe). */
  caption: z.string().optional(),
  /** Label for the x-axis (e.g. "Month", "Category"). Shown small + muted. */
  xLabel: z.string().optional(),
  /** Label for the y-axis / value dimension (e.g. "Revenue ($)"). */
  yLabel: z.string().optional(),
  /** The ordered data points. Empty renders a calm empty state, never a crash. */
  points: z.array(chartPointSchema),
} as const

/**
 * The union of series names across every point, in first-seen order — the set of
 * lines/bars/areas to render. Derived, never stored: the data is point-major so a
 * series simply is any key that appears in some point's `values`.
 */
export function seriesNames(points: readonly ChartPoint[]): string[] {
  const seen: string[] = []
  for (const p of points) {
    for (const key of Object.keys(p.values ?? {})) {
      if (!seen.includes(key)) seen.push(key)
    }
  }
  return seen
}

/** Row-major shape the Bklit charts consume: one flat object per point. */
export type ChartRow = Record<string, string | number>

/**
 * Transform point-major data into the flat rows Bklit expects: `{ [xKey]: label,
 * seriesA: n, seriesB: n }`. `xKey` is the field the chart reads its x from
 * ("x" here, mapped to the Bklit `xDataKey`). Undefined series values are omitted so
 * a gap stays a gap.
 */
export function toChartRows(points: readonly ChartPoint[], xKey = 'x'): ChartRow[] {
  return points.map((p) => {
    const row: ChartRow = { [xKey]: p.x }
    for (const [name, value] of Object.entries(p.values ?? {})) {
      if (typeof value === 'number') row[name] = value
    }
    return row
  })
}

/**
 * Rows for the Bklit TIME-SERIES shell when the x axis is categorical (#94): the
 * shell scales x with `scaleTime`, so each category becomes an ORDINAL instant
 * (`0, 1, 2…` ms — always a valid Date, evenly spaced) under `xKey`, and the label
 * the person should read rides `labelKey` for the shell's `xLabelKey` prop. A
 * category label is never handed to `new Date()`.
 */
export function toCategoricalChartRows(points: readonly ChartPoint[], xKey = 'x', labelKey = 'xLabel'): ChartRow[] {
  return points.map((p, i) => {
    const row: ChartRow = { [xKey]: i, [labelKey]: p.x }
    for (const [name, value] of Object.entries(p.values ?? {})) {
      if (typeof value === 'number') row[name] = value
    }
    return row
  })
}

/**
 * Honest text summary for `serialize` (the prompt body + embedding source): each
 * series' name with its value range and last value, so the AI's context matches
 * what the user sees without dumping every point. A `kind` word ("line"/"bar"/"area")
 * is prepended by each module so the read tells the model what shape this is.
 */
export function summarizeChart(
  kind: string,
  data: { title?: string; caption?: string; points: readonly ChartPoint[] }
): string {
  const head = `${kind} chart${data.title ? ` "${data.title}"` : ''}`
  if (data.points.length === 0) return `${head}: (no data)`
  const names = seriesNames(data.points)
  const parts = names.map((name) => {
    const nums = data.points
      .map((p) => p.values?.[name])
      .filter((v): v is number => typeof v === 'number')
    if (nums.length === 0) return `${name}: (no values)`
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const last = nums[nums.length - 1]
    const range = min === max ? `${min}` : `${min}–${max}`
    return `${name}: ${range} (last ${last})`
  })
  const cap = data.caption ? ` — ${data.caption}` : ''
  return `${head} over ${data.points.length} points${cap}; ${parts.join('; ')}`
}
