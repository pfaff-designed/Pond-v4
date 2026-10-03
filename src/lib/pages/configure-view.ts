/**
 * configure_view accept path (#19 slice 5) — resolve an AI-proposed view config
 * (keyed by property NAME) against a collection's schema and upsert THE view block
 * on that collection page.
 *
 * The tool is a name-keyed UPSERT, not a create: the user selects which existing
 * renderer (table/board/calendar/gallery/gantt/chart/big-number) draws a collection's
 * rows, plus single-clause group-by / sort / filter (decision 15) and, for the chart
 * and big-number modes, what is aggregated (#111). Nothing here mints a new *kind* of
 * view, and nothing here carries data — a chart's numbers are read from the records.
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
import type {
  ViewBlock,
  ViewMode,
  ViewSort,
  ViewFilter,
  FilterOp,
  ViewChartConfig,
  ViewBigNumberConfig,
  ViewChartKind,
  ViewChartPresentation,
  ViewAggValue,
  ViewFigureFormat,
} from '@/lib/modules/view/schema'
import { getPage, saveBlocks } from '@/lib/pages/client'
import { collectionNameResolver, type CollectionCandidate } from '@/lib/pages/create-page'

/**
 * A configure_view proposal after the user has (optionally) corrected its target.
 * Every property reference is a NAME (never an id) — resolved on accept.
 */
export interface ConfigureViewProposal {
  /** The collection whose view is configured (a page carrying a `_schema`). */
  pageId: string
  /** Which renderer draws the rows. */
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
  /**
   * Chart mode (#111): which kind, bucketed by which property NAME, plotting which
   * property NAME with which verb. Names — never ids; resolved on accept like every
   * other clause. NO data: a chart view aggregates the records at read time.
   */
  chart?: {
    kind: ViewChartKind
    xProperty?: string
    series: Array<{ property: string; agg: ViewAggValue }>
    stacked?: boolean
    /** A gauge goal / composed reference line (#94) — a plain number, nothing to resolve. */
    target?: number
    /** The card or the board's compact inline mark (#259) — a flag, nothing to resolve. */
    presentation?: ViewChartPresentation
  }
  /** Big-number mode (#111): the one figure, by property NAME + verb + format. */
  bigNumber?: {
    property?: string
    agg: ViewAggValue
    format?: ViewFigureFormat
    /** Optional trend: the figure over the records matching this clause vs the rest.
     *  Property by NAME, value by LABEL for a select/status — resolved on accept. */
    delta?: { property: string; value: string }
  }
  /**
   * A linked view over ANOTHER collection (#41 / #20 D6). Already a collection id
   * (resolved from a NAME by the accept path), NOT a name: the view lives on `pageId`
   * (the host) but draws THIS collection's rows. Omitted for a view over the host's
   * own rows.
   */
  collectionId?: string
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
  /** Resolved chart config — property NAMES swapped for their stable ids (#111). */
  chart?: ViewChartConfig
  /** Resolved big-number config — same name→id swap (#111). */
  bigNumber?: ViewBigNumberConfig
  /** The linked-view target collection id, passed through from the proposal (#41). */
  collectionId?: string
}

/**
 * Resolve a linked view's TARGET collection from a NAME (#41 / #20 D6). The model
 * names another collection to draw here; on accept we match that name against the
 * user's pages (case-insensitive title, COLLECTIONS only — a linked view must point
 * at a schema-bearing page) and return its id, or null when nothing matches. On a
 * duplicate title the FIRST match wins as a pre-selection; the proposal card's
 * collection picker lets the user disambiguate before writing.
 */
export function resolveCollectionByName(pages: CollectionCandidate[], name: string): string | null {
  // Reuse the shared collection-name→id lookup (create-page.ts, #20) so linked-view
  // targeting and relation targeting resolve a NAME identically; normalize its
  // `undefined` "no match" to null for the picker's `?? pageId` pre-selection fallback.
  return collectionNameResolver(pages)(name) ?? null
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
  // `pageId` names the target page and plays no part in resolution, so a caller that
  // has no page yet — a premade template being instantiated (#261) — may omit it.
  proposal: Omit<ConfigureViewProposal, 'pageId'> & { pageId?: string }
): ResolvedViewConfig {
  const byName = byNameLookup(schema)
  const config: ResolvedViewConfig = { mode: proposal.mode }

  // A linked view's target is already a collection id (resolved from a name upstream),
  // so it passes straight through — no schema lookup, unlike the property clauses.
  if (proposal.collectionId) config.collectionId = proposal.collectionId

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

  // Chart mode (#111) — the same name→id resolution, series by series. A series
  // naming a property that isn't in the schema is DROPPED (lenient, like a stale
  // filter clause); if that empties the series list the whole chart config is
  // dropped, and the renderer infers a drawable one rather than showing nothing.
  if (proposal.chart) {
    const series = proposal.chart.series
      .map((s) => {
        const def = byName.get(s.property.trim().toLowerCase())
        return def ? { property: def.id, agg: s.agg } : null
      })
      .filter((s): s is { property: string; agg: ViewAggValue } => s !== null)
    if (series.length > 0) {
      const xDef = proposal.chart.xProperty
        ? byName.get(proposal.chart.xProperty.trim().toLowerCase())
        : undefined
      config.chart = {
        kind: proposal.chart.kind,
        // An unresolved x property means "one point per record" (the same fallback
        // the renderer uses), never a dangling id.
        ...(xDef ? { xProperty: xDef.id } : {}),
        series,
        ...(proposal.chart.stacked ? { stacked: true } : {}),
        ...(typeof proposal.chart.target === 'number' ? { target: proposal.chart.target } : {}),
        // #261: the presentation rides through untouched, so a template's compact
        // strip does not come back a card. NOTE this closes only the resolver half:
        // `configure_view`'s own tool input (`api/chat/tools.ts`) still has no
        // `presentation` field, so zod strips it and the MODEL cannot switch a view
        // to compact through this tool — even though `viewDescriptor.description`
        // advertises it in the prompt. That gap is #268; `propose_changes` can emit
        // it today because `viewSchema` carries it.
        ...(proposal.chart.presentation ? { presentation: proposal.chart.presentation } : {}),
      }
    }
  }

  // Big-number mode (#111). `count` needs no property at all, so a figure that only
  // counts records resolves even when no name was given.
  if (proposal.bigNumber) {
    const def = proposal.bigNumber.property
      ? byName.get(proposal.bigNumber.property.trim().toLowerCase())
      : undefined
    if (def || proposal.bigNumber.agg === 'count') {
      // The trend clause resolves exactly like a filter: property NAME → id, and a
      // select/status value LABEL → option id (the stored identity). An unresolved
      // property drops the trend and keeps the figure.
      const deltaDef = proposal.bigNumber.delta
        ? byName.get(proposal.bigNumber.delta.property.trim().toLowerCase())
        : undefined
      const delta =
        deltaDef && proposal.bigNumber.delta
          ? {
              property: deltaDef.id,
              value:
                deltaDef.type === 'select' || deltaDef.type === 'status'
                  ? (resolveOptionValue(deltaDef, proposal.bigNumber.delta.value) ?? '')
                  : proposal.bigNumber.delta.value,
            }
          : undefined
      config.bigNumber = {
        ...(def ? { property: def.id } : {}),
        agg: def ? proposal.bigNumber.agg : 'count',
        ...(proposal.bigNumber.format ? { format: proposal.bigNumber.format } : {}),
        ...(delta ? { delta } : {}),
      }
    }
  }

  return config
}

/**
 * Upsert THE view block on a page's blocks (decision 4): reconfigure the top-most
 * existing view block in place — preserving its stable id and any `collectionId` —
 * or mint a fresh one when the page has no view yet. Returns a NEW blocks array
 * (the input is never mutated) plus `replaced` — true when an existing view block was
 * reconfigured, false when a fresh one was minted. A reconfigure REPLACES the config
 * wholesale (an omitted clause clears the old one — selecting a view is a fresh choice,
 * not a merge).
 *
 * #52 fix 2 (multi-view honesty). A collection shows exactly ONE active view, so a
 * SECOND configure_view SWITCHES the active view rather than adding a coexisting one.
 * `replaced` surfaces that fact so the accept path can say "switched active view
 * (replaced the previous table)" on the receipt/stamp — the model must not claim the
 * two views coexist.
 */
export function upsertViewBlock(
  blocks: Block[],
  config: ResolvedViewConfig,
  mintId: () => string
): { blocks: Block[]; replaced: boolean } {
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
    ...(config.chart ? { chart: config.chart } : {}),
    ...(config.bigNumber ? { bigNumber: config.bigNumber } : {}),
    // A linked-view target from THIS config wins; otherwise preserve any existing
    // link so an inline reconfigure of a previously-linked view stays linked (#41).
    ...((config.collectionId ?? existing?.collectionId)
      ? { collectionId: config.collectionId ?? existing?.collectionId }
      : {}),
  }

  if (idx >= 0) {
    const next = [...blocks]
    next[idx] = block
    return { blocks: next, replaced: true }
  }
  return { blocks: [...blocks, block], replaced: false }
}

/**
 * Write an accepted configure_view proposal. The view block LIVES on the host
 * (`pageId`) and its `mode`/clauses resolve against the collection whose rows it
 * DRAWS: for an inline view that is the host itself (which must be a collection);
 * for a LINKED view (#41) it is the named target `collectionId`, and the host need
 * only hold the block. Confirms the schema source exists AND is a collection (throws
 * otherwise so the card reverts rather than silently no-op), resolves the name-keyed
 * config against that schema, upserts the block onto the host's blocks, and persists
 * them. Never touches `props` — the view block is config-only, so `_schema` is safe.
 */
export async function configureViewFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: ConfigureViewProposal,
  mintId: () => string
): Promise<{ id: string; replaced: boolean }> {
  const host = await getPage(supabase, proposal.pageId)
  if (!host) {
    throw new Error(`Cannot configure a view: page ${proposal.pageId} was not found`)
  }

  // The collection whose schema names resolve against + whose rows the view draws.
  // Inline: the host. Linked: the named target — must exist and be a collection.
  let schemaSource = host
  if (proposal.collectionId) {
    const target = await getPage(supabase, proposal.collectionId)
    if (!target) {
      throw new Error(
        `Cannot configure a linked view: collection ${proposal.collectionId} was not found`
      )
    }
    schemaSource = target
  }
  const schema = readSchema(schemaSource.props)
  if (!schema) {
    throw new Error(
      `Cannot configure a view: page ${schemaSource.id} is not a collection (it has no schema)`
    )
  }

  // A gantt draws bars from date properties (decision: #27 grill). Reject one over a
  // collection with none, so the card reverts rather than writing an un-drawable view.
  if (proposal.mode === 'gantt' && !schema.some((d) => d.type === 'date')) {
    throw new Error(
      `Cannot configure a gantt: collection ${schemaSource.id} has no date property to place bars on`
    )
  }

  // #52 fix 2 — surface whether this upsert REPLACED an existing view, so the accept
  // path can render the honest "switched the active view" receipt (a collection shows
  // one active view at a time).
  const config = resolveViewConfig(schema, proposal)
  const { blocks, replaced } = upsertViewBlock(host.blocks, config, mintId)
  await saveBlocks(supabase, proposal.pageId, blocks)
  return { id: proposal.pageId, replaced }
}
