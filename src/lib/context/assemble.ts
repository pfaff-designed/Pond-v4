/**
 * Context assembly for the AI terminal (Track C).
 *
 * Two retrieval surfaces, per ticket-04 §"Context scoping" and ticket-06
 * §"Retrieval (RAG)":
 *   1. Auto-injection — the currently open node + its direct children are
 *      injected into the prompt automatically on every message.
 *   2. @mention — cross-space context, pulled on demand when the user references
 *      another node by name. (The AI never fetches cross-space context itself.)
 *   3. Workspace outline — a titles-only, two-level page tree injected on every
 *      message so create_page can infer a sensible parent (never page bodies).
 *
 * The pure logic (parseMentions / blocksToText / formatNodeContext) is unit
 * tested; the DB-fetch layer (fetchNodeContext / resolveMention) is verified
 * live against Supabase.
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js imports.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NodeType } from '@/lib/supabase/types'
import { getChildPages } from '@/lib/pages/client'
import { inPond, resolvePond } from '@/lib/pond/scope'
import { resolveDescriptor } from '@/lib/modules/registry'
import type { Block } from '@/lib/documents/types'
import { ROW_TYPE, readSchema, readValues } from '@/lib/properties/schema'
import type { PropertySchema } from '@/lib/properties/schema'
import type { ViewRow } from '@/lib/modules/view/schema'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChildSummary {
  type: NodeType
  title: string
}

export interface NodeContextData {
  type: NodeType
  title: string
  documents: { title: string; blocks: Block[] }[]
  children: ChildSummary[]
  /**
   * #19 slice 5: the page's property schema when it is a collection — surfaced so
   * the model can name a group-by / sort / filter property (and add_row/
   * define_schema by name) against real column names. `null` when the page carries
   * no `_schema` (an ordinary, non-collection page).
   */
  schema?: PropertySchema | null
}

export interface MentionRef {
  name: string
  nodeId: string
  nodeType: NodeType
}

/** Titles-only page row for the workspace outline (no blocks — kept lean). */
export interface PageSummary {
  id: string
  parentId: string | null
  type: NodeType
  title: string
}

// ── parseMentions (pure) ─────────────────────────────────────────────────────

/**
 * Extract @references from a message. Supports two forms:
 *   - @[Name With Spaces]  → bracketed, for multi-word node names
 *   - @Word                → a single run of word characters/dashes
 *
 * A leading word-boundary is required so email addresses (foo@bar) are ignored.
 * Trailing punctuation is not captured. Results are de-duplicated, order kept.
 */
export function parseMentions(text: string): string[] {
  const names: string[] = []
  // Bracketed first, then bare. (?<![\w@]) guards against emails / mid-word @.
  const re = /(?<![\w@])@(?:\[([^\]]+)\]|([A-Za-z0-9][A-Za-z0-9-]*))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = (m[1] ?? m[2]).trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

// ── blocksToText (pure) ──────────────────────────────────────────────────────

/** Flatten a document's blocks into plain text for the prompt. */
export function blocksToText(blocks: Block[]): string {
  return (
    blocks
      // Pass the block's page-mates so a sibling-deriving module (bound metric,
      // ticket-23) serializes the same number the UI shows.
      .map((block) => resolveDescriptor(block.type).serialize(block, blocks))
      .filter((line) => line.length > 0)
      .join('\n')
  )
}

// ── formatNodeContext (pure) ─────────────────────────────────────────────────

// #108: no 'Area' label — an area is a page that has pages inside it, so a
// container reads as "Page" here and its children speak for its area-ness.
const TYPE_LABEL: Record<NodeType, string> = {
  routine: 'Routine',
  project: 'Project',
  action: 'Action',
  page: 'Page',
  // ticket-44: the reserved Life home page. Surfaced in the outline so Pond can
  // target it (propose_changes targetPageId) — composing Life's own home blocks.
  home: 'Home',
  // #18: a collection's schema-bound child. Kept out of the rail/page tree,
  // but labelled here so any context path that does surface one reads cleanly.
  row: 'Row',
}

/**
 * Render a collection's schema as one compact line (#19 slice 5) — the property
 * NAMES + types the model must use to name a group-by / sort / filter (and to
 * author add_row/define_schema by name). Select/status props list their option
 * labels so the model can name a filter value. A `rollup` serializes its DEFINITION
 * — aggregate + the relation it rolls over (by name) — never a computed value (#20
 * D9): rollups are never stored, so the server has no value to embed without a
 * cross-collection row fetch. Returns '' for an empty schema.
 *
 *   Properties: Status (status: To do | Doing | Done) · Due (date) · Total (rollup: sum via Purchases)
 */
export function formatSchemaLine(schema: PropertySchema): string {
  if (schema.length === 0) return ''
  const cols = schema.map((def) => {
    if (def.type === 'rollup') {
      // Resolve the relation by id within THIS schema (its sibling) → name; the
      // rolled property lives on the target collection (out of scope here).
      const rel = schema.find((d) => d.id === def.relationId)
      const via = rel ? ` via ${rel.name}` : ''
      return `${def.name} (rollup: ${def.aggregate ?? 'rollup'}${via})`
    }
    const opts =
      (def.type === 'select' || def.type === 'status') && def.options?.length
        ? `: ${def.options.map((o) => o.label).join(' | ')}`
        : ''
    return `${def.name} (${def.type}${opts})`
  })
  return `Properties: ${cols.join(' · ')}`
}

/** One-line preview of a block's content, for the id-addressed listing. */
function blockPreview(block: Block, siblings: Block[]): string {
  return resolveDescriptor(block.type).preview(block, siblings)
}

/**
 * Render a node's assembled context as a compact block for the system prompt.
 *
 * `includeBlockIds` surfaces each editable block's stable id so the model can
 * target a specific block in a `propose_changes` edit/remove (Slice 2). Only the
 * auto-injected current node opts in — @mentioned nodes are not editable
 * targets, so they omit ids to keep the prompt clean and unambiguous.
 */
export function formatNodeContext(
  data: NodeContextData,
  opts: { label?: string; includeBlockIds?: boolean } = {}
): string {
  const lines: string[] = []
  lines.push(`[${opts.label ?? 'Current node'}]`)

  lines.push(`${TYPE_LABEL[data.type]}: ${data.title}`)

  // #19 slice 5: a collection's property columns, so the model can name a
  // group-by / sort / filter (and add_row / define_schema) against real names.
  if (data.schema && data.schema.length > 0) {
    lines.push(formatSchemaLine(data.schema))
  }

  const docText = data.documents
    .map((doc) => {
      const body = blocksToText(doc.blocks)
      const title = doc.title || 'Untitled'
      return body ? `  - "${title}": ${body}` : `  - "${title}"`
    })
    .join('\n')
  if (docText) {
    lines.push('Documents:')
    lines.push(docText)
  }

  if (opts.includeBlockIds) {
    // Per-document loops (same output order as the old flatMap) so each block's
    // preview receives its own page-mates as siblings (bound metrics, ticket-23).
    if (data.documents.some((doc) => doc.blocks.length > 0)) {
      lines.push('Editable blocks (reference a block by its id when proposing an edit):')
      for (const doc of data.documents) {
        for (const block of doc.blocks) {
          const preview = blockPreview(block, doc.blocks)
          lines.push(`  - [${block.id}] (${block.type})${preview ? ` ${preview}` : ''}`)
        }
      }
    }
  }

  if (data.children.length > 0) {
    lines.push('Children:')
    for (const child of data.children) {
      lines.push(`  - ${TYPE_LABEL[child.type]}: ${child.title}`)
    }
  }

  return lines.join('\n')
}

// ── formatWorkspaceOutline (pure) ────────────────────────────────────────────

/**
 * Render the FULL workspace outline — every page at every depth, with its id —
 * so the model can:
 *   - infer a sensible parent for a new page (create_page's `parentTitle`), and
 *   - name ANY page to READ (`read_page`) or EDIT (`propose_changes`
 *     `targetPageId`) — cross-page targeting, ticket-30.
 *
 * Ids are surfaced as `[id]` before each title so cross-page targeting resolves
 * by id, never by fuzzy title. All depths are listed (ticket-30 review): the
 * old two-level cut left pages at depth 3+ readable but unreachable for a
 * cross-page edit — exactly the read/write asymmetry this ticket kills. Titles
 * only (never page bodies), so depth costs one line per page. Returns '' for
 * an empty workspace.
 */
export function formatWorkspaceOutline(pages: PageSummary[]): string {
  const topLevel = pages.filter((p) => p.parentId === null)
  if (topLevel.length === 0) return ''

  const lines: string[] = []
  lines.push(
    '[Workspace outline] (existing pages — the [id] targets a page for read_page or a cross-page edit; a page a new page could live under)'
  )
  const emit = (page: PageSummary, depth: number) => {
    lines.push(`${'  '.repeat(depth)}- [${page.id}] ${TYPE_LABEL[page.type]}: ${page.title}`)
    for (const child of pages.filter((p) => p.parentId === page.id)) {
      emit(child, depth + 1)
    }
  }
  for (const page of topLevel) emit(page, 0)
  return lines.join('\n')
}

// ── DB fetch layer (live-verified) ───────────────────────────────────────────

type Sb = SupabaseClient<Database>

/**
 * Fetch a page's own metadata, its content, and its direct child pages. Returns
 * null if the page can't be found (e.g. wrong id / not owned by user).
 *
 * In the unified model a page IS its document: its own `blocks` are surfaced as
 * the node's content, and every direct child page (of any type) is listed as a
 * child. This collapses the former per-type table lookups into two queries.
 */
export async function fetchNodeContext(
  sb: Sb,
  userId: string,
  nodeId: string,
  /** #341: scopes the read to this pond, like `resolveMention`'s `pond`. Optional
   *  until the other call sites thread it through — omitted, the read stays
   *  unscoped by pond, as before. */
  pond?: string | null
): Promise<NodeContextData | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = sb
    .from('pages')
    .select('type, title, blocks, props, deleted_at')
    .eq('id', nodeId)
    .eq('user_id', userId)
  const { data: own } = await (pond === undefined ? q : inPond(q, pond)).maybeSingle()

  if (!own) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = own as any
  // #341: a trashed row (migration 0027's `deleted_at`, not in the generated
  // types) is left out — same as an id that never resolved.
  if (row.deleted_at) return null

  const rawBlocks: Block[] = Array.isArray(row.blocks) ? (row.blocks as Block[]) : []
  // #19 read-hydration seam (decision 16): a `view` block draws this page's
  // `type='row'` children, but serialize is sync and gets page-mates, not children.
  // Fetch the rows once (only when a view is present) and attach them to each view
  // block BEFORE it serializes — so blocksToText / blockPreview render the rows.
  const viewHydrated = await hydrateViewBlocks(sb, userId, nodeId, rawBlocks)
  const blocks = await hydratePageLinkBlocks(sb, userId, viewHydrated)
  const documents = blocks.length ? [{ title: row.title as string, blocks }] : []

  const children = await fetchChildren(sb, userId, nodeId)

  return {
    type: row.type as NodeType,
    title: row.title as string,
    documents,
    children,
    // #19 slice 5: a collection's schema, so the model can name its columns.
    schema: readSchema(row.props as Record<string, unknown> | null),
  }
}

/** Direct child pages of a node — one query, any type, arbitrary depth. */
async function fetchChildren(sb: Sb, userId: string, nodeId: string): Promise<ChildSummary[]> {
  const pages = await getChildPages(sb, userId, nodeId)
  return pages.map((p) => ({ type: p.type, title: p.title }))
}

/**
 * #19 read-hydration seam (decision 16). Attach a view block's rows to it before the
 * sync `serialize`/`preview` path runs. A view draws its HOST page's `type='row'`
 * children by default; a LINKED view (`collectionId` set, #41) draws that target
 * collection's rows instead. Each distinct source's children are fetched once and
 * grafted onto the matching view blocks. No-op (no query) when the page has no view
 * block. The `rows` field is transient (never persisted): the view schema is
 * config-only.
 *
 * #111: each row also carries its property `values`, and the block its source
 * collection's `schema` — the chart and big-number modes AGGREGATE the records at
 * serialize time, so the model must read the same figures the user sees. One extra
 * query for the sources' schemas, and only when a view is present.
 */
export async function hydrateViewBlocks(
  sb: Sb,
  userId: string,
  nodeId: string,
  blocks: Block[]
): Promise<Block[]> {
  const viewBlocks = blocks.filter((b) => b.type === 'view')
  if (viewBlocks.length === 0) return blocks

  // Each view's source: its linked collection, or the host page for an inline view.
  // Fetch every distinct source's row children once (usually just the host).
  const sourceIds = new Set(viewBlocks.map((b) => b.collectionId ?? nodeId))
  const rowsBySource = new Map<string, ViewRow[]>()
  for (const sourceId of sourceIds) {
    const children = await getChildPages(sb, userId, sourceId)
    rowsBySource.set(
      sourceId,
      children
        .filter((p) => p.type === ROW_TYPE)
        // `values` (#111) is the row's property map — what chart/big-number modes
        // aggregate. `readValues` strips the reserved `_schema` key, so a row can
        // never smuggle a schema into a figure.
        .map((p) => ({ id: p.id, title: p.title, values: readValues(p.props) }))
    )
  }

  // The sources' own property schemas — one query for all of them. Needed to read a
  // chart/big-number figure at serialize time (a property id means nothing without
  // its type and, for a choice, its option labels).
  const schemaBySource = new Map<string, PropertySchema>()
  const { data: sourcePages } = await sb
    .from('pages')
    .select('id, props')
    .eq('user_id', userId)
    .in('id', [...sourceIds])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of (sourcePages ?? []) as any[]) {
    const schema = readSchema(page.props as Record<string, unknown> | null)
    if (schema) schemaBySource.set(page.id as string, schema)
  }

  // `b.type === 'view'` narrows to ViewBlock so the `rows` graft type-checks (a
  // plain boolean helper wouldn't narrow, and grafting rows onto a table block's
  // own `rows` would collide).
  return blocks.map((b) => {
    if (b.type !== 'view') return b
    const sourceId = b.collectionId ?? nodeId
    const schema = schemaBySource.get(sourceId)
    return {
      ...b,
      rows: rowsBySource.get(sourceId) ?? [],
      // Omitted for a non-collection source, so serialize degrades to naming the
      // rows rather than reporting a figure it cannot honestly compute.
      ...(schema ? { schema } : {}),
    }
  })
}

/**
 * Graft each `page-link` block's linked page's live title on, transiently, so
 * `blocksToText`/`blockPreview` (via `pageLinkDescriptor.serialize`) render the
 * current title rather than the raw `pageId`. One query for every distinct
 * linked page, skipped entirely when the page has no `page-link` block.
 */
export async function hydratePageLinkBlocks(
  sb: Sb,
  userId: string,
  blocks: Block[]
): Promise<Block[]> {
  const pageLinkBlocks = blocks.filter((b) => b.type === 'page-link')
  if (pageLinkBlocks.length === 0) return blocks

  const pageIds = new Set(pageLinkBlocks.map((b) => b.pageId))
  const { data } = await sb
    .from('pages')
    .select('id, title')
    .eq('user_id', userId)
    .in('id', [...pageIds])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titleById = new Map(((data ?? []) as any[]).map((p) => [p.id as string, p.title as string]))

  return blocks.map((b) => {
    if (b.type !== 'page-link') return b
    const title = titleById.get(b.pageId)
    return title === undefined ? b : { ...b, title }
  })
}

/** All of a user's pages as lean title rows for the workspace outline — one
 *  query, no blocks/embeddings (listPages would drag every page body along). */
export async function fetchPageSummaries(
  sb: Sb,
  userId: string,
  /**
   * #312: `Pond 06.13` `s6m5` — "the composer reads only this pond". This is the
   * outline the model is given, so without the pond it was handed EVERY pond's
   * page titles: a new pond's chat could name, mention and propose against pages
   * that pond cannot see. Already resolved — see `buildChatContext`.
   */
  pond: string | null
): Promise<PageSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (sb as any)
    .from('pages')
    .select('id, parent_id, type, title')
    .eq('user_id', userId)

  const { data } = await inPond(q, pond).order('order', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    type: r.type as NodeType,
    title: r.title as string,
  }))
}

/**
 * Find this pond's page whose title matches (case-insensitive). A title is unique
 * only among siblings in one pond, so the same name in another pond is a different
 * page — and never one this pond's composer may read.
 */
export async function resolveMention(
  sb: Sb,
  userId: string,
  name: string,
  /** Already resolved — see `buildChatContext`. */
  pond: string | null
): Promise<MentionRef | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (sb as any).from('pages').select('id, type').eq('user_id', userId)
  const { data } = await inPond(q, pond).ilike('title', name).limit(1).maybeSingle()

  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  return { name, nodeId: row.id as string, nodeType: row.type as NodeType }
}

// ── buildChatContext (orchestration, live-verified) ──────────────────────────

export interface BuildChatContextOptions {
  nodeId?: string | null
  nodeType?: NodeType | null
  latestUserText?: string
  /** #312: the pond whose pages the model may see. See `fetchPageSummaries`. */
  pondId: string | null
  /** KAN-99: the person dismissed the open page's whole-page chip for this
   *  visit — withhold its content block, even though `nodeId` itself still
   *  rides the request (propose_changes still targets it). */
  skipNodeContext?: boolean
  /**
   * KAN-309: the route also needs the open node's data (for `withOpenPageNow`),
   * so it fetches it once and hands it in here rather than this function
   * fetching it again. `undefined` (the default) means "fetch it yourself" —
   * only a caller that already has the data passes it, `null` included.
   */
  nodeData?: NodeContextData | null
}

/**
 * Assemble the full context string to prepend to the system prompt for a chat
 * turn: the current node (auto-injected), any @mentioned nodes, and a
 * titles-only workspace outline (so create_page can infer a parent even from
 * the Home view). Returns '' when there is nothing to inject.
 */
export async function buildChatContext(
  sb: Sb,
  userId: string,
  opts: BuildChatContextOptions
): Promise<string> {
  const blocks: string[] = []
  const pond = await resolvePond(sb, userId, opts.pondId)

  if (opts.nodeId && !opts.skipNodeContext) {
    const data =
      opts.nodeData !== undefined ? opts.nodeData : await fetchNodeContext(sb, userId, opts.nodeId, pond)
    // Current node only: expose block ids so the model can target one in propose_changes.
    // #341: a resolved-but-unreadable node (another pond, or trashed) still rode the
    // request — say so, rather than letting the model answer as if nothing was asked.
    blocks.push(data ? formatNodeContext(data, { includeBlockIds: true }) : '[Current node] unavailable')
  }

  if (opts.latestUserText) {
    for (const name of parseMentions(opts.latestUserText)) {
      const ref = await resolveMention(sb, userId, name, pond)
      if (!ref) continue
      const data = await fetchNodeContext(sb, userId, ref.nodeId, pond)
      if (data) blocks.push(formatNodeContext(data, { label: `Referenced: @${ref.name}` }))
    }
  }

  const outline = formatWorkspaceOutline(await fetchPageSummaries(sb, userId, pond))
  if (outline) blocks.push(outline)

  return blocks.join('\n\n')
}
