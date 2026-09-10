import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { summarizeHeatmap } from './data'

/**
 * `heatmap` (#12) — a calendar/activity heatmap promoted from the Bklit set
 * (GitHub-contributions grid). Data is the flat, AI-emittable `{ date, value }`
 * list (see data.ts); the view bins it into the Bklit `HeatmapColumn[]` grid via
 * `toHeatmapGrid` and wraps it in module-card chrome. Read-only, AI-maintained —
 * like the promoted charts.
 */

/** One day's cell: ISO calendar date + numeric value. */
export const heatmapCellSchema = z.object({
  /** ISO calendar date, `YYYY-MM-DD`. One entry per active day. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number(),
})
export type HeatmapCellData = z.infer<typeof heatmapCellSchema>

export const heatmapSchema = z.object({
  id: z.string(),
  type: z.literal('heatmap'),
  /** Optional card title, shown as a kicker above the grid. */
  title: z.string().optional(),
  /** Optional one-line caption under the title (scope, units, timeframe). */
  caption: z.string().optional(),
  /** One cell per active day. Empty renders a calm empty state, never a crash. */
  cells: z.array(heatmapCellSchema),
})

export type HeatmapBlock = z.infer<typeof heatmapSchema>

export const heatmapDescriptor: ModuleDescriptor<HeatmapBlock> = {
  type: 'heatmap',
  schema: heatmapSchema,
  paletteDescription: 'A calendar grid showing daily activity intensity.',
  description:
    'A calendar activity heatmap (GitHub-contributions grid): one cell per day, colour intensity by value, binned into week columns. Use for DAILY habit or activity density over weeks/months — workouts logged, pages read, practice sessions. ' +
    'Data is a list of `cells`, each `{ date: "YYYY-MM-DD", value: <number> }` — one entry per ACTIVE day (omit zero days; the grid fills the gaps). ' +
    'Do NOT use for a trend of aggregated values over time (use `chart-line`) or for a single headline number (use `stat` or `metric`).',
  serialize: (data) => summarizeHeatmap(data),
}
