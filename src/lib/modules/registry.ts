/**
 * Module descriptor registry (t12) — the server-safe half of the two-map contract.
 *
 * `{ type → { type, schema, description } }`. Pure data, no React: importable in
 * server context (Route Handlers, t04) so the AI (t16) can read the machine-readable
 * capability list and the write boundary can validate emitted modules — without
 * pulling any client view component into the server bundle. The client half lives in
 * `renderers.ts`, joined to this by the `type` string.
 */
import type { ModuleDescriptor } from './types'
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
import { viewDescriptor } from './view/schema'

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
  // #19: an inline view of a collection's rows (table/board/calendar/gallery).
  view: viewDescriptor,
} satisfies Record<string, ModuleDescriptor>

export type DescriptorType = keyof typeof moduleDescriptors

/**
 * Types kept in the registry for read/render/serialize tolerance but retired from
 * CREATION (#19 slice 6): the standalone `kanban` block is superseded by the `view`
 * block's board mode over a collection. Persisted kanban blocks still hydrate and
 * render; neither the human palette nor the AI may mint a new one. `table` is NOT
 * retired — it remains the freeform-grid primitive (no collection-view equivalent).
 */
export const RETIRED_FROM_CREATION = ['kanban'] as const
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

// Re-export the content union so consumers have one server-safe entry point.
export { blockSchema } from './content'
export type { Block, BlockType } from './content'
