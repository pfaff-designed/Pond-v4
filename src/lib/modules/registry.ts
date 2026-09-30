/**
 * Module descriptor registry (t12) — the server-safe half of the two-map contract.
 *
 * `{ type → { type, schema, description } }`. Pure data, no React: importable in
 * server context (Route Handlers, t04) so the AI (t16) can read the machine-readable
 * capability list and the write boundary can validate emitted modules — without
 * pulling any client view component into the server bundle. The client half lives in
 * `renderers.ts`, joined to this by the `type` string.
 */
import type { ModuleDescriptor, ResolvedDescriptor } from './types'
import { textDescriptor } from './text/schema'
import { todoDescriptor } from './todo/schema'
import { metricDescriptor } from './metric/schema'
import { metricRingDescriptor } from './metric-ring/schema'
import { tableDescriptor } from './table/schema'
import { kanbanDescriptor } from './kanban/schema'
import { pageDescriptor } from './page/schema'
import { chartLineDescriptor } from './chart-line/schema'
import { chartBarDescriptor } from './chart-bar/schema'
import { chartAreaDescriptor } from './chart-area/schema'
import { heatmapDescriptor } from './heatmap/schema'
import { statDescriptor } from './stat/schema'
import { timelineDescriptor } from './timeline/schema'
import { viewDescriptor } from './view/schema'
import { imageDescriptor } from './image/schema'

export const moduleDescriptors = {
  text: textDescriptor,
  todo: todoDescriptor,
  metric: metricDescriptor,
  'metric-ring': metricRingDescriptor,
  table: tableDescriptor,
  kanban: kanbanDescriptor,
  page: pageDescriptor,
  // ticket-36: Bklit chart promotion (line / bar / area).
  'chart-line': chartLineDescriptor,
  'chart-bar': chartBarDescriptor,
  'chart-area': chartAreaDescriptor,
  // #12: Bklit promotion, wave 2 (calendar heatmap / headline KPI stat).
  heatmap: heatmapDescriptor,
  stat: statDescriptor,
  // #11: standalone AI-composable timeline (Gantt) — read-only inline items, no
  // collection (distinct from the #27 `view` block's gantt mode).
  timeline: timelineDescriptor,
  // #19: an inline view of a collection's rows (table/board/calendar/gallery).
  view: viewDescriptor,
  // #61: an uploaded image / file attachment, referenced by storage URL.
  image: imageDescriptor,
} satisfies Record<string, ModuleDescriptor>

export type DescriptorType = keyof typeof moduleDescriptors

/**
 * Types kept in the registry for read/render/serialize tolerance but retired from
 * CREATION. Persisted blocks of these types still hydrate and render; neither the
 * human palette nor the AI may mint a new one.
 *
 * `kanban` (#19 slice 6) is superseded by the `view` block's board mode over a
 * collection.
 *
 * The eight data-holding display blocks (#111) are superseded by the `view` block's
 * `chart` and `big-number` modes. Each of them held its OWN copy of the data —
 * `points`, `cells`, `items`, a hand-set `value` — which the design forbids: "the
 * record is the source of truth… nothing holds a copy." A chart or a headline figure
 * is now a view of a database, aggregated from the records at read time. No data
 * migration: existing pages keep rendering through these descriptors (#111 AC 6).
 *
 * `table` is NOT retired — it remains the freeform-grid primitive (a genuine matrix,
 * not a set of records), and `promote_table` (#101) is how a table becomes a database.
 */
export const RETIRED_FROM_CREATION = [
  'kanban',
  'chart-line',
  'chart-bar',
  'chart-area',
  'heatmap',
  'timeline',
  'metric',
  'metric-ring',
  'stat',
] as const
export type RetiredType = (typeof RETIRED_FROM_CREATION)[number]

/**
 * Look up a descriptor by persisted `type` string. Undefined only for a stale
 * persisted type that is no longer registered (t12 §2: tolerate, never hard-fail
 * on read) — for every registered module the required facets make omission a
 * compile error, not a silent fallthrough.
 */
export function descriptorFor(type: string): ModuleDescriptor | undefined {
  return (moduleDescriptors as Record<string, ModuleDescriptor>)[type]
}

/**
 * Unknown/unregistered type -> a callable no-op. `serialize`/`preview` yield the
 * empty string (which assemble already filters out) and there are no id paths to
 * walk (the same no-op as skipping). The missing-type policy (t12 §2: tolerate,
 * never hard-fail on read) lives here so no caller writes `?.`/`??`.
 */
const NULL_DESCRIPTOR: ResolvedDescriptor = {
  serialize: () => '',
  preview: () => '',
  nestedIdPaths: [],
}

/**
 * Resolve a persisted `type` to a TOTAL descriptor: optional facets defaulted
 * (`preview ?? serialize`, `nestedIdPaths ?? []`), unknown type -> NULL_DESCRIPTOR.
 * Never returns undefined. The one place those defaults + the missing-type policy
 * live, so the two id-stampers (hydrate + preview) can no longer drift.
 */
export function resolveDescriptor(type: string): ResolvedDescriptor {
  const d = descriptorFor(type)
  if (!d) return NULL_DESCRIPTOR
  return {
    // Forward via arrows (not raw method refs) so a descriptor that reads `this`
    // keeps working; none do today, but this keeps the accessor honest.
    serialize: (data, siblings) => d.serialize(data, siblings),
    preview: (data, siblings) => (d.preview ?? d.serialize)(data, siblings),
    nestedIdPaths: d.nestedIdPaths ?? [],
  }
}

// Re-export the content union so consumers have one server-safe entry point.
export { blockSchema } from './content'
export type { Block, BlockType } from './content'
