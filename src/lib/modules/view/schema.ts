import { z } from 'zod'
import type { ModuleDescriptor } from '../types'

/**
 * The `view` block (#19) — an inline block that DRAWS a collection's rows.
 *
 * A view is pure *config*: which render `mode`, and an optional single-clause
 * `filter`, single-key `sort`, and `groupBy` (decision 15 — compound filters
 * deferred). It carries NO rows of its own. The rows are the collection page's
 * `type='row'` children (#18), fetched and injected before `serialize` runs — the
 * read-hydration seam in `assemble.ts` (decision 16). Because the persisted block
 * is config-only and every id it references (`groupBy`/`sort.key`/`filter.property`
 * are property ids; `collectionId` a page id) already exists, the AI never mints an
 * id here — so there are no `nestedIdPaths` and the emit shape is a flat id strip.
 *
 * A view renders its OWN page's rows by default; when `collectionId` is set it is a
 * LINKED view (#41) that draws ANOTHER collection's rows instead. Both are hydrated
 * the same way — the assemble seam injects the source collection's rows before
 * `serialize` runs, and the client renderer fetches them via `useCollectionRows`.
 */

/** The render modes (decision 13). table/board landed in slice 3; calendar (agenda) + gallery in slice 4; gantt (read-only timeline) in #27. */
export const VIEW_MODES = ['table', 'board', 'calendar', 'gallery', 'gantt'] as const
export const viewModeSchema = z.enum(VIEW_MODES)
export type ViewMode = z.infer<typeof viewModeSchema>

/** Single-clause filter operators (decision 15). Kept small and property-typed on purpose. */
export const FILTER_OPS = ['eq', 'neq', 'contains', 'gt', 'lt'] as const
export const filterOpSchema = z.enum(FILTER_OPS)
export type FilterOp = z.infer<typeof filterOpSchema>

/** Single-key sort: a property id + direction. */
export const viewSortSchema = z.object({
  key: z.string(),
  dir: z.enum(['asc', 'desc']),
})
export type ViewSort = z.infer<typeof viewSortSchema>

/** Single-clause filter: property id `op` a scalar value (string; renderer coerces per type). */
export const viewFilterSchema = z.object({
  property: z.string(),
  op: filterOpSchema,
  value: z.string(),
})
export type ViewFilter = z.infer<typeof viewFilterSchema>

export const viewSchema = z.object({
  id: z.string(),
  type: z.literal('view'),
  mode: viewModeSchema,
  /** Board group-by: the id of the select/status property to bucket rows under. */
  groupBy: z.string().optional(),
  sort: viewSortSchema.optional(),
  filter: viewFilterSchema.optional(),
  /** Gantt (#27): the id of the `date` property a bar STARTS at. Omitted → inferred (1st date prop). */
  startDate: z.string().optional(),
  /** Gantt (#27): the id of the `date` property a bar ENDS at. Omitted → inferred (2nd date prop); none → single-day bars. */
  endDate: z.string().optional(),
  /** A linked view over ANOTHER collection (#41) — draws that collection's rows instead of the host page's. */
  collectionId: z.string().optional(),
})
export type ViewBlock = z.infer<typeof viewSchema>

/**
 * A row injected into a view block by the `assemble.ts` hydration seam (decision
 * 16) — the collection page's `type='row'` children reduced to what serialize
 * needs. NOT persisted: the view block's own schema is config-only, so `rows`
 * lives only on the transient `HydratedViewBlock` the assemble path builds before
 * calling `serialize`. Slice 2 renders titles; the renderers (slices 3–4) resolve
 * per-row property values.
 */
export interface ViewRow {
  id: string
  title: string
}

/** A view block with its rows attached for serialization/render. Transient, never persisted. */
export type HydratedViewBlock = ViewBlock & { rows?: readonly ViewRow[] }

export const viewDescriptor: ModuleDescriptor<ViewBlock> = {
  type: 'view',
  schema: viewSchema,
  description:
    "An inline view that displays a collection's rows (its type='row' child pages, #18) as a table, board, calendar, gallery, or gantt (a read-only timeline over Start→End date properties). Use ONLY on a page that is a collection (has a property schema) or that has row children. `mode` picks the layout; `groupBy` (a select/status property id) buckets a board; `sort` and a single `filter` clause reference existing property ids; `startDate`/`endDate` (date property ids) place gantt bars. Do not use to lay out ordinary prose — that's a text block.",
  // Serialize the CONFIG in full (the AI re-emits it, so every clause must be
  // visible) plus the hydrated row titles for context fidelity. Rows arrive on the
  // transient HydratedViewBlock the assemble seam builds; absent that injection
  // (e.g. a bare block passed to blocksToText), a view honestly renders "no rows".
  serialize: (data) => {
    const rows = (data as HydratedViewBlock).rows ?? []
    const cfg: string[] = [data.mode]
    if (data.groupBy) cfg.push(`grouped by ${data.groupBy}`)
    if (data.sort) cfg.push(`sorted by ${data.sort.key} ${data.sort.dir}`)
    if (data.filter)
      cfg.push(`filtered ${data.filter.property} ${data.filter.op} ${data.filter.value}`)
    if (data.collectionId) cfg.push(`linked collection ${data.collectionId}`)
    const head = `View (${cfg.join(', ')})`
    if (rows.length === 0) return `${head} — no rows`
    const titles = rows.map((r) => r.title || 'Untitled').join(', ')
    return `${head} — ${rows.length} row${rows.length === 1 ? '' : 's'}: ${titles}`
  },
  // No minted child ids: config references existing property/page ids, and rows
  // are child pages hydrated at read time — never part of the persisted block.
}
