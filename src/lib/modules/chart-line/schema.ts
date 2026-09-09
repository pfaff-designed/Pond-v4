import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { chartBaseShape, summarizeChart } from '../chart/data'

/**
 * `chart-line` (ticket-36) — a line chart promoted from the Bklit set. A trend over
 * an ordered (usually time) axis. Data is the shared point-major `{ x, values }`
 * shape (see chart/data.ts); the view maps it into the Bklit `LineChart` and wraps it
 * in module-card chrome.
 */
export const chartLineSchema = z.object({
  id: z.string(),
  type: z.literal('chart-line'),
  ...chartBaseShape,
})

export type ChartLineBlock = z.infer<typeof chartLineSchema>

export const chartLineDescriptor: ModuleDescriptor<ChartLineBlock> = {
  type: 'chart-line',
  schema: chartLineSchema,
  paletteDescription: 'A line chart for a value trending over time.',
  description:
    'A line chart: one or more numeric series plotted over an ordered x-axis. Use for a TREND OVER TIME — a value rising or falling across days/weeks/months. ' +
    'Data is a list of `points`, each `{ x: "<label>", values: { "<series>": <number> } }`; the series are the line names (share the same `x` labels across points to compare multiple lines). For time-series make `x` a date-parseable string like "2026-01". ' +
    'Do NOT use a chart for just 2–3 standalone numbers — use `metric` for those. Prefer a line for continuity over time; use `chart-bar` for comparing discrete categories.',
  serialize: (data) => summarizeChart('Line', data),
}
