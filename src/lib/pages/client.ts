/**
 * Persistence layer for the unified page tree.
 *
 * Everything is a page: areas, sub-areas, projects, actions, and free-floating
 * notes are all rows in `public.pages`, nested via `parent_id` (null = top-level)
 * to arbitrary depth. A page IS its own document — its content (`blocks`) and
 * `embedding` live on the row. Deleting a page cascades to its whole subtree via
 * the self-referential FK (no application-side recursion needed).
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js imports. Follows the
 * cast-to-any pattern for insert/update chains (Supabase's generated types don't
 * narrow well through the builder). Supersedes lib/documents/client.ts.
 *
 * ticket-43: all reads pass workspace='main'|'sandbox' to isolate scopes.
 * Writes (createPage) also stamp the workspace column. Reads by id (getPage,
 * saveBlocks, updateTitle, deletePage) are id-scoped and trust the caller has
 * the right page — no workspace filter needed there (FK cascade and id primary
 * key keep them safe).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NodeType } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { WorkspaceScope } from '@/lib/workspace/context'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PondPage {
  id: string
  parentId: string | null
  type: NodeType
  title: string
  blocks: Block[]
  status: string | null
  order: number
}

export interface CreatePageInput {
  parentId?: string | null
  type?: NodeType
  title?: string
  blocks?: Block[]
  status?: string | null
  props?: Record<string, unknown>
  workspace?: WorkspaceScope
}

/** A page returned by semantic search, with its cosine similarity to the query. */
export interface MatchedPage extends PondPage {
  similarity: number
}

type PageRow = {
  id: string
  parent_id: string | null
  type: NodeType
  title: string
  blocks: unknown
  status: string | null
  order: number
}

const PAGE_COLUMNS = 'id, parent_id, type, title, blocks, status, "order"'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Blocks are stored as jsonb; coerce anything non-array to []. */
function toBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : []
}

function mapRow(row: PageRow): PondPage {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    type: row.type,
    title: row.title,
    blocks: toBlocks(row.blocks),
    status: row.status ?? null,
    order: row.order ?? 0,
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** A single page by id, or null if it doesn't exist. */
export async function getPage(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<PondPage | null> {
  const { data } = await supabase.from('pages').select(PAGE_COLUMNS).eq('id', id).maybeSingle()

  return data ? mapRow(data as PageRow) : null
}

/**
 * Direct child pages of a node, ordered by `order`. Pass `null` for the
 * top-level pages (those with no parent). A page may have zero, one, or many
 * children of any type.
 *
 * ticket-43: workspace filters to the correct scope so sandbox children
 * never appear in main queries and vice-versa.
 */
export async function getChildPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string | null,
  workspace: WorkspaceScope = 'main'
): Promise<PondPage[]> {
  let query = supabase
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('user_id', userId)
    .eq('workspace', workspace)

  // PostgREST needs `.is()` for null, `.eq()` otherwise.
  query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId)

  const { data } = await query.order('order', { ascending: true })

  const rows = (data ?? []) as PageRow[]
  return rows.map(mapRow)
}

/**
 * All of a user's pages as a flat list, ordered by `order`. The sidebar builds its
 * tree from this shape in memory; the AI create_page proposal card uses it to
 * populate the destination (parent) picker and to pre-resolve an AI-proposed parent
 * title to an id. Reads the same columns as the other list reads.
 *
 * ticket-43: workspace filters to the correct scope.
 */
export async function listPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspace: WorkspaceScope = 'main'
): Promise<PondPage[]> {
  const { data } = await supabase
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('user_id', userId)
    .eq('workspace', workspace)
    .order('order', { ascending: true })

  const rows = (data ?? []) as PageRow[]
  return rows.map(mapRow)
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Create a page under a parent (or top-level when parentId is null/omitted). */
export async function createPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreatePageInput
): Promise<PondPage> {
  const insert = {
    user_id: userId,
    parent_id: input.parentId ?? null,
    type: input.type ?? 'page',
    title: input.title ?? '',
    blocks: input.blocks ?? [],
    status: input.status ?? null,
    props: input.props ?? {},
    workspace: input.workspace ?? 'main',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('pages').insert(insert).select('id').single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create page')

  return {
    id: data.id as string,
    parentId: insert.parent_id,
    type: insert.type,
    title: insert.title,
    blocks: insert.blocks as Block[],
    status: insert.status,
    order: 0,
  }
}

/**
 * Overwrite a page's entire block array. Per the spec, blocks are never
 * partially updated — the whole array is written on save.
 */
export async function saveBlocks(
  supabase: SupabaseClient<Database>,
  id: string,
  blocks: Block[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ blocks, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Rename a page. */
export async function updateTitle(
  supabase: SupabaseClient<Database>,
  id: string,
  title: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Persist a page's embedding vector (Track D — semantic search). Written
 * alongside content on save so retrieval matches the latest blocks.
 */
export async function updateEmbedding(
  supabase: SupabaseClient<Database>,
  id: string,
  embedding: number[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ embedding, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Delete a page. Its entire subtree (descendants of any depth) is removed by the
 * `parent_id ... on delete cascade` FK — no application-side recursion.
 */
export async function deletePage(supabase: SupabaseClient<Database>, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('pages').delete().eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Semantic search across all of a user's pages (Track D). Delegates the
 * cosine-similarity ranking to the match_pages pgvector RPC; the caller supplies
 * an already-computed query embedding (see embeddings/retrieve.ts). Returns
 * matches ordered most-similar first.
 */
export async function matchPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  queryEmbedding: number[],
  matchCount = 5
): Promise<MatchedPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('match_pages', {
    query_embedding: queryEmbedding,
    match_user_id: userId,
    match_count: matchCount,
  })

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    parentId: r.parent_id ?? null,
    type: (r.type ?? 'page') as NodeType,
    title: r.title as string,
    blocks: toBlocks(r.blocks),
    status: r.status ?? null,
    order: 0,
    similarity: r.similarity as number,
  }))
}
