/**
 * Module descriptor registry (t12) — the server-safe half of the two-map contract.
 *
 * `{ type → { type, schema, description } }`. Pure data, no React: importable in
 * server context (Route Handlers, t04) so the AI (t16) can read the machine-readable
 * capability list and the write boundary can validate emitted modules — without
 * pulling any client view component into the server bundle. The client half lives in
 * `renderers.ts`, joined to this by the `type` string.
 */
import { blockLabel } from './types'
import type { ModuleDescriptor, ResolvedDescriptor } from './types'
import { textDescriptor } from './text/schema'
import { todoDescriptor } from './todo/schema'
import { tableDescriptor } from './table/schema'
import { pageDescriptor } from './page/schema'
import { viewDescriptor } from './view/schema'
import { imageDescriptor } from './image/schema'
import { highlightDescriptor } from './highlight/schema'
import { entriesDescriptor } from './entries/schema'
import { pageLinkDescriptor } from './page-link/schema'

export const moduleDescriptors = {
  text: textDescriptor,
  todo: todoDescriptor,
  table: tableDescriptor,
  page: pageDescriptor,
  // #19: an inline view of a collection's rows. One carrier for every view kind;
  // each kind's name, card and empty state is `view/kinds.ts` (KAN-44, ADR 0009).
  view: viewDescriptor,
  // #61: an uploaded image / file attachment, referenced by storage URL.
  image: imageDescriptor,
  // #249: a kept passage — authored content, so a block (ADR 0007).
  highlight: highlightDescriptor,
  // #250: dated prose — authored content, so a block (ADR 0007).
  entries: entriesDescriptor,
  // KAN-122: the row `/ nested page` leaves behind at the `/` line's own index.
  'page-link': pageLinkDescriptor,
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
/**
 * Prefix a block's model-facing text with its label (#258), or return the text
 * unchanged when the block has none — so every block without a label is
 * byte-identical to before and no prompt or eval output moves.
 *
 * The label LEADS, because that is what it is on the surface: the block's eyebrow.
 * `sep` is `':\n'` for the full body and `' — '` for the one-line preview.
 *
 * A LABELLED block with empty content surfaces as its label alone rather than as the
 * empty string. That is deliberate: `blocksToText` drops empty lines, so otherwise a
 * block the person had deliberately named would be invisible to the model and the
 * next wholesale re-emit would delete it — the very failure this fix exists to
 * prevent, just with no content yet. An UNLABELLED empty block is still dropped.
 */
function withLabel(data: unknown, text: string, sep = ':\n'): string {
  const label = blockLabel(data)
  if (!label) return text
  return text.length > 0 ? `${label}${sep}${text}` : `${label}:`
}

export function resolveDescriptor(type: string): ResolvedDescriptor {
  const d = descriptorFor(type)
  if (!d) return NULL_DESCRIPTOR
  return {
    // Forward via arrows (not raw method refs) so a descriptor that reads `this`
    // keeps working; none do today, but this keeps the accessor honest.
    //
    // #258: the LABEL is emitted HERE, not in each module's `serialize`. Three
    // reasons, in order of weight:
    //
    //   1. `serialize`'s contract (types.ts) is that "a block the model cannot read
    //      here is silently destroyed on the next wholesale `edit`" — and the label
    //      is model-WRITABLE from this commit (it rides both emit unions and its
    //      `.describe()` reaches the tool JSON schema), so the loss is live now, not
    //      gated on #261.
    //   2. A label is a CROSS-TYPE field — one `labelledBlockFields` mixin over five
    //      schemas — so a per-module prefix would be five copies of one rule plus a
    //      standing obligation on every future module. That is the work item ADR 0006
    //      warns is forgotten, and #250's review is the evidence that one gets missed.
    //   3. This is the single seam both model-facing readers go through — `blocksToText`
    //      and `blockPreview` (context/assemble.ts) are the only non-test `.serialize(`
    //      / `.preview(` call sites in `src/` — and it already owns cross-cutting facet
    //      resolution (`preview ?? serialize`, `nestedIdPaths ?? []`). The embeddings
    //      reuse `blocksToText` on purpose so retrieval and prompt text cannot diverge,
    //      so one fix covers those too. A sixth labelled type is covered for free.
    //
    // `NULL_DESCRIPTOR` is returned above and never wrapped, so an unregistered type
    // still serializes to '' exactly as before.
    serialize: (data, siblings) => withLabel(data, d.serialize(data, siblings)),
    preview: (data, siblings) => withLabel(data, (d.preview ?? d.serialize)(data, siblings), ' — '),
    nestedIdPaths: d.nestedIdPaths ?? [],
  }
}

// Re-export the content union so consumers have one server-safe entry point.
export { blockSchema } from './content'
export type { Block, BlockType } from './content'
