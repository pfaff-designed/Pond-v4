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
import { tableDescriptor } from './table/schema'
import { pageDescriptor } from './page/schema'
import { viewDescriptor } from './view/schema'
import { imageDescriptor } from './image/schema'
import { highlightDescriptor } from './highlight/schema'

export const moduleDescriptors = {
  text: textDescriptor,
  todo: todoDescriptor,
  table: tableDescriptor,
  page: pageDescriptor,
  // #19: an inline view of a collection's rows (table/board/calendar/gallery).
  view: viewDescriptor,
  // #61: an uploaded image / file attachment, referenced by storage URL.
  image: imageDescriptor,
  // #249: a kept passage — authored content, so a block (ADR 0007).
  highlight: highlightDescriptor,
} satisfies Record<string, ModuleDescriptor>

export type DescriptorType = keyof typeof moduleDescriptors

/**
 * `table` is NOT retired — it remains the freeform-grid primitive (a genuine matrix,
 * not a set of records), and `promote_table` (#101) is how a table becomes a database.
 */

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
