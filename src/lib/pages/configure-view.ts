/**
 * configure_view accept path (#19 slice 5) — resolve an AI-proposed view config
 * (keyed by property NAME) against a collection's schema and upsert THE view block
 * on that collection page.
 *
 * The tool is a name-keyed UPSERT, not a create: the user selects which of the four
 * existing renderers (table/board/calendar/gallery) draws a collection's rows, plus
 * single-clause group-by / sort / filter (decision 15). Nothing here mints a new
 * *kind* of view.
 *
 * Two pure steps + one write, mirroring `resolveRowValues`/`addRowFromProposal`:
 *   1. resolveViewConfig — map each proposed property NAME onto the schema's stable
 *      property id (case-insensitive, first def wins), resolve a select/status
 *      filter value label→option-id, and DROP any clause whose property name isn't
 *      in the schema (lenient — a mis-config self-heals into a calm renderer notice,
 *      #18 decision 9). `mode` is a closed enum and always kept.
 *   2. upsertViewBlock — reconfigure the top-most existing view block in place
 *      (preserving its id + collectionId), or mint one when the page has none
 *      (decision 4).
 *   3. configureViewFromProposal — confirm the target exists AND is a collection
 *      (throws otherwise so the card reverts rather than silently no-ops), then
 *      persist the new blocks via saveBlocks.
 *
 * No Next.js imports — takes a SupabaseClient, exercised directly in jest.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { readSchema, resolveOptionValue } from '@/lib/properties/schema'
import type { PropertyDef, PropertySchema } from '@/lib/properties/schema'
import type { ViewBlock, ViewMode, ViewSort, ViewFilter, FilterOp } from '@/lib/modules/view/schema'
import { getPage, saveBlocks } from '@/lib/pages/client'

/**
 * A configure_view proposal after the user has (optionally) corrected its target.
 * Every property reference is a NAME (never an id) — resolved on accept.
 */
export interface ConfigureViewProposal {
  /** The collection whose view is configured (a page carrying a `_schema`). */
  pageId: string
  /** Which of the four renderers draws the rows. */
  mode: ViewMode
  /** Board group-by — a property NAME (required by the tool when mode==='board'). */
  groupBy?: string
  /** Single-key sort — a property NAME + direction. */
  sort?: { key: string; dir: 'asc' | 'desc' }
  /** Single-clause filter — a property NAME `op` a scalar (label for select/status). */
  filter?: { property: string; op: FilterOp; value: string }
  /** Gantt (#27): the NAME of the date property bars start at (optional; else inferred). */
  startDate?: string
  /** Gantt (#27): the NAME of the date property bars end at (optional; else inferred). */
  endDate?: string
}

/** The resolved view config: the ViewBlock's config fields with ids in place. */
export interface ResolvedViewConfig {
  mode: ViewMode
  groupBy?: string
  sort?: ViewSort
  filter?: ViewFilter
  /** Resolved gantt start/end date property ids (see startDate/endDate names above). */
  startDate?: string
  endDate?: string
}

/** Case-insensitive property lookup by name (first def wins on a duplicate name). */
function byNameLookup(schema: PropertySchema): Map<string, PropertyDef> {
  const byName = new Map<string, PropertyDef>()
  for (const def of schema) {
    const key = def.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, def)
  }
  return byName
}

/**
 * Resolve an AI-proposed name-keyed view config into a persistable config with
 * stable property ids. Each of groupBy / sort.key / filter.property is matched to a
 * property by name; an unresolved name drops THAT clause (lenient) while the rest —
 * and always the `mode` — survive. A select/status filter value resolves
 * label→option-id (mirroring resolveRowValues); other filter values pass through.
 */
export function resolveViewConfig(
  schema: PropertySchema,
  proposal: ConfigureViewProposal
): ResolvedViewConfig {
  const byName = byNameLookup(schema)
  const config: ResolvedViewConfig = { mode: proposal.mode }

  if (proposal.groupBy) {
    const def = byName.get(proposal.groupBy.trim().toLowerCase())
    if (def) config.groupBy = def.id // else dropped (lenient) — board shows its notice
  }

  if (proposal.sort) {
    const def = byName.get(proposal.sort.key.trim().toLowerCase())
    if (def) config.sort = { key: def.id, dir: proposal.sort.dir }
  }

  if (proposal.filter) {
    const def = byName.get(proposal.filter.property.trim().toLowerCase())
    if (def) {
      const value =
        def.type === 'select' || def.type === 'status'
          ? (resolveOptionValue(def, proposal.filter.value) ?? '')
          : proposal.filter.value
      config.filter = { property: def.id, op: proposal.filter.op, value }
    }
  }

  // Gantt start/end — resolve each NAME to its property id (lenient drop when the
  // name isn't in the schema); an omitted or dropped clause falls back to render-side
  // positional inference (1st date = start, 2nd = end) in pickGanttDefs.
  if (proposal.startDate) {
    const def = byName.get(proposal.startDate.trim().toLowerCase())
    if (def) config.startDate = def.id
  }
  if (proposal.endDate) {
    const def = byName.get(proposal.endDate.trim().toLowerCase())
    if (def) config.endDate = def.id
  }

  return config
}

/**
 * Upsert THE view block on a page's blocks (decision 4): reconfigure the top-most
 * existing view block in place — preserving its stable id and any `collectionId` —
 * or mint a fresh one when the page has no view yet. Returns a NEW blocks array;
 * the input is never mutated. A reconfigure REPLACES the config wholesale (an
 * omitted clause clears the old one — selecting a view is a fresh choice, not a
 * merge).
 */
export function upsertViewBlock(
  blocks: Block[],
  config: ResolvedViewConfig,
  mintId: () => string
): Block[] {
  const idx = blocks.findIndex((b) => b.type === 'view')
  const existing = idx >= 0 ? (blocks[idx] as ViewBlock) : null

  const block: ViewBlock = {
    id: existing?.id ?? mintId(),
    type: 'view',
    mode: config.mode,
    ...(config.groupBy ? { groupBy: config.groupBy } : {}),
    ...(config.sort ? { sort: config.sort } : {}),
    ...(config.filter ? { filter: config.filter } : {}),
    ...(config.startDate ? { startDate: config.startDate } : {}),
    ...(config.endDate ? { endDate: config.endDate } : {}),
    ...(existing?.collectionId ? { collectionId: existing.collectionId } : {}),
  }

  if (idx >= 0) {
    const next = [...blocks]
    next[idx] = block
    return next
  }
  return [...blocks, block]
}

/**
 * Write an accepted configure_view proposal. Confirms the target exists AND is a
 * collection (throws otherwise so the card can revert rather than silently no-op),
 * resolves the proposed name-keyed config against the collection's schema, upserts
 * the view block, and persists the page's blocks. Never touches `props` — the view
 * block is config-only and lives in `blocks`, so `_schema` is untouched by design.
 */
export async function configureViewFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: ConfigureViewProposal,
  mintId: () => string
): Promise<{ id: string }> {
  const page = await getPage(supabase, proposal.pageId)
  if (!page) {
    throw new Error(`Cannot configure a view: page ${proposal.pageId} was not found`)
  }
  const schema = readSchema(page.props)
  if (!schema) {
    throw new Error(
      `Cannot configure a view: page ${proposal.pageId} is not a collection (it has no schema)`
    )
  }

  // A gantt draws bars from date properties (decision: #27 grill). Reject one over a
  // collection with none, so the card reverts rather than writing an un-drawable view.
  if (proposal.mode === 'gantt' && !schema.some((d) => d.type === 'date')) {
    throw new Error(
      `Cannot configure a gantt: collection ${proposal.pageId} has no date property to place bars on`
    )
  }

  const config = resolveViewConfig(schema, proposal)
  const blocks = upsertViewBlock(page.blocks, config, mintId)
  await saveBlocks(supabase, proposal.pageId, blocks)
  return { id: proposal.pageId }
}
