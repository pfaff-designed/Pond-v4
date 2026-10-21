/**
 * The content-block union — server-safe (t12).
 *
 * `Block` is the discriminated union of every *content* module (the modules that
 * live in a page's ordered `blocks` array). It deliberately excludes the `page`
 * container module, which lives one tier up and *holds* a `Block[]` — keeping this
 * file free of the page↔content import cycle.
 *
 * This union is the single Zod source consumed by:
 *   - the derived `Block` TS type (existing imports keep working via the
 *     `documents/types.ts` shim),
 *   - server-side write validation, and
 *   - the AI composition tool's `data` discriminated union (t16).
 */
import { z } from 'zod'
import { textSchema } from './text/schema'
import { todoSchema } from './todo/schema'
import { tableSchema } from './table/schema'
import { viewSchema } from './view/schema'
import { imageSchema } from './image/schema'
import { highlightSchema } from './highlight/schema'
import { entriesSchema } from './entries/schema'
import { pageLinkSchema } from './page-link/schema'

/**
 * A block's width (6x), set from its handle. `'1/4' | '1/3' | '1/2' | '2/3' | '3/4'
 * | 'full'`. Absent means full, so every existing page reads unchanged.
 */
const blockWidthSchema = z.enum(['1/4', '1/3', '1/2', '2/3', '3/4', 'full'])
export type BlockWidth = z.infer<typeof blockWidthSchema>

/**
 * The shared `width` mixin (KAN-43), extended onto every union member HERE rather
 * than inside each per-module schema file, the way `labelledBlockFields` is. That
 * keeps the per-module files untouched and, since `ai-composition.ts` imports those
 * files directly rather than `blockSchema`, keeps `width` out of the AI-facing
 * unions for free — Pond never authors layout.
 */
const blockWidthFields = {
  width: blockWidthSchema
    .optional()
    .describe("Never set by the AI. Reserved for the person's own layout choice."),
  /**
   * Forces `layoutRows` to start a new row at this block, even with room left in
   * the current row (KAN-440). Absent means today's greedy packing by width alone,
   * so an existing page lays out unchanged. Set by a drop plan, never by the AI.
   */
  rowStart: z
    .boolean()
    .optional()
    .describe("Never set by the AI. Reserved for the person's own layout choice."),
  /**
   * A view, image or table's pixel height (KAN-442). Absent means the block's
   * content height, so an existing page lays out unchanged. Set by an edge
   * drag, never by the AI. Prose blocks ignore it.
   */
  height: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Never set by the AI. Reserved for the person's own layout choice."),
}

export const blockSchema = z.discriminatedUnion('type', [
  textSchema.extend(blockWidthFields),
  todoSchema.extend(blockWidthFields),
  tableSchema.extend(blockWidthFields),
  // #19: the inline collection view block (config only; rows are child pages).
  viewSchema.extend(blockWidthFields),
  // #61: an uploaded image / file attachment, referenced by storage URL.
  imageSchema.extend(blockWidthFields),
  // #249: a kept passage — wheat's one legal job (ADR 0005 / 0007).
  highlightSchema.extend(blockWidthFields),
  // #250: dated prose — serif only when the block's own flag says so (ADR 0005 / 0007).
  entriesSchema.extend(blockWidthFields),
  // KAN-122: the row `/ nested page` leaves behind at the `/` line's own index.
  pageLinkSchema.extend(blockWidthFields),
])

/** A content module persisted in a page's `blocks` array. */
export type Block = z.infer<typeof blockSchema>

/** Every content-block `type` string, for exhaustiveness and lookups. */
export type BlockType = Block['type']
