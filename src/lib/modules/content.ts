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
import { metricSchema } from './metric/schema'
import { metricRingSchema } from './metric-ring/schema'
import { tableSchema } from './table/schema'
import { chartLineSchema } from './chart-line/schema'
import { chartBarSchema } from './chart-bar/schema'
import { chartAreaSchema } from './chart-area/schema'

export const blockSchema = z.discriminatedUnion('type', [
  textSchema,
  todoSchema,
  metricSchema,
  metricRingSchema,
  tableSchema,
  // ticket-36: Bklit chart promotion (line / bar / area).
  chartLineSchema,
  chartBarSchema,
  chartAreaSchema,
])

/** A content module persisted in a page's `blocks` array. */
export type Block = z.infer<typeof blockSchema>

/** Every content-block `type` string, for exhaustiveness and lookups. */
export type BlockType = Block['type']
