import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { chartBaseShape, summarizeChart } from '../chart/data'

/**
 * `chart-bar` (ticket-36) — a bar chart promoted from the Bklit set. Comparison
 * across discrete categories. Same shared point-major data shape as `chart-line`;
 * the view maps it into the Bklit `BarChart` (grouped bars for multi-series) and
 * wraps it in module-card chrome.
 */
export const chartBarSchema = z.object({
  id: z.string(),
  type: z.literal('chart-bar'),
  ...chartBaseShape,
})

export type ChartBarBlock = z.infer<typeof chartBarSchema>

export const chartBarDescriptor: ModuleDescriptor<ChartBarBlock> = {
  type: 'chart-bar',
  schema: chartBarSchema,
  paletteDescription: 'A bar chart comparing values across categories.',
  description:
    'A bar chart: numeric values COMPARED ACROSS DISCRETE CATEGORIES. Use to compare quantities between named things — spend by category, count per project, hours per activity. ' +
    'Data is a list of `points`, each `{ x: "<category>", values: { "<series>": <number> } }`; `x` is the category label. Multiple series per point render as grouped bars. ' +
    'Do NOT use a chart for just 2–3 standalone numbers — use `metric`. Use `chart-line` (not bar) for a trend over time.',
  serialize: (data) => summarizeChart('Bar', data),
}
