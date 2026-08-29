import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { chartBaseShape, summarizeChart } from '../chart/data'

/**
 * `chart-area` (ticket-36) — an area chart promoted from the Bklit set. Like
 * `chart-line` but with the region under each series filled: emphasises magnitude /
 * accumulation over time rather than the precise line. Same shared point-major data
 * shape; the view maps it into the Bklit `AreaChart` and wraps it in module-card
 * chrome. Earns the third slot over heatmap: identical time-series data contract to
 * line (no new 2D-matrix schema), so it is cheap to promote and reason about.
 */
export const chartAreaSchema = z.object({
  id: z.string(),
  type: z.literal('chart-area'),
  ...chartBaseShape,
})

export type ChartAreaBlock = z.infer<typeof chartAreaSchema>

export const chartAreaDescriptor: ModuleDescriptor<ChartAreaBlock> = {
  type: 'chart-area',
  schema: chartAreaSchema,
  description:
    'An area chart: a numeric series over an ordered x-axis with the region under the curve filled. Use like a line chart when you want to emphasise MAGNITUDE or VOLUME over time — cumulative total, amount held, coverage — rather than the exact trend line. ' +
    'Data is a list of `points`, each `{ x: "<label>", values: { "<series>": <number> } }`; for time-series make `x` a date-parseable string like "2026-01". ' +
    'Do NOT use a chart for 2–3 standalone numbers — use `metric`. Prefer `chart-line` when the precise trend matters more than the filled magnitude; use `chart-bar` for discrete category comparison.',
  serialize: (data) => summarizeChart('Area', data),
}
