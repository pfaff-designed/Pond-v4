import { z } from 'zod'
import type { ModuleDescriptor } from '../types'
import { summarizeTimeline } from './data'

/**
 * `timeline` (#11) — a standalone AI-composable Gantt, sibling of the #12
 * heatmap/stat promotions and DISTINCT from the #27 `gantt` collection *view
 * mode*: the view mode charts a collection's child-page date props and
 * reschedules them by drag; this module is read-only with AI-authored inline
 * `items` on the block itself — no collection needed. Layout semantics are the
 * shared `layoutBars` core (missing/backwards end → single-day milestone tick;
 * no-start item omitted; empty → calm state).
 */

/** One bar: a label plus its ISO start day (and optional inclusive end day). */
export const timelineItemSchema = z.object({
  label: z.string(),
  /** ISO calendar day, `YYYY-MM-DD`, the bar's first day. */
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO calendar day, inclusive last day. Omit for a single-day milestone tick. */
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})
export type TimelineItemData = z.infer<typeof timelineItemSchema>

export const timelineSchema = z.object({
  id: z.string(),
  type: z.literal('timeline'),
  /** Optional card title, shown as a kicker above the bars. */
  title: z.string().optional(),
  /** Optional one-line caption under the title (scope, timeframe). */
  caption: z.string().optional(),
  /** One bar per item. Empty renders a calm empty state, never a crash. */
  items: z.array(timelineItemSchema),
})
export type TimelineBlock = z.infer<typeof timelineSchema>

export const timelineDescriptor: ModuleDescriptor<TimelineBlock> = {
  type: 'timeline',
  schema: timelineSchema,
  description:
    'A project timeline (Gantt): one horizontal bar per item over a shared date axis with weekly gridlines. Use for the PHASES, milestones, or scheduled stretches of a project, plan, or trip — e.g. "Demo → Framing → Finish" with dates. ' +
    'Data is inline `items`, each `{ label, start: "YYYY-MM-DD", end?: "YYYY-MM-DD" }` — omit `end` for a single-day milestone. ' +
    'Do NOT use for a numeric trend over time (use `chart-line`), for daily activity density (use `heatmap`), or to chart an existing collection of pages by their date properties (use a `view` in gantt mode).',
  serialize: (data) => summarizeTimeline(data),
}
