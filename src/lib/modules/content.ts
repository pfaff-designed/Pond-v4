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

export const blockSchema = z.discriminatedUnion('type', [
  textSchema,
  todoSchema,
  tableSchema,
  // #19: the inline collection view block (config only; rows are child pages).
  viewSchema,
  // #61: an uploaded image / file attachment, referenced by storage URL.
  imageSchema,
  // #249: a kept passage — wheat's one legal job (ADR 0005 / 0007).
  highlightSchema,
  // #250: dated prose — serif only when the block's own flag says so (ADR 0005 / 0007).
  entriesSchema,
])

/** A content module persisted in a page's `blocks` array. */
export type Block = z.infer<typeof blockSchema>

/** Every content-block `type` string, for exhaustiveness and lookups. */
export type BlockType = Block['type']
