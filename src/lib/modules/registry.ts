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
import { pageDescriptor } from './page/schema'

export const moduleDescriptors = {
  text: textDescriptor,
  todo: todoDescriptor,
  metric: metricDescriptor,
  'metric-ring': metricRingDescriptor,
  table: tableDescriptor,
  page: pageDescriptor,
} satisfies Record<string, ModuleDescriptor>

export type DescriptorType = keyof typeof moduleDescriptors

// Re-export the content union so consumers have one server-safe entry point.
export { blockSchema } from './content'
export type { Block, BlockType } from './content'
