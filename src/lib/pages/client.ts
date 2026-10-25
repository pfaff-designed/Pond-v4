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
 * #312: a page belongs to a pond, and the LIST reads (`listPages`, `siblingRows`)
 * are confined to one with `inPond` — never every pond. Reads by id (getPage, getChildPages,
 * saveBlocks, updateTitle, deletePage) are id-scoped and trust the caller has
 * the right page — the id or the `parent_id` already pins the pond, and the FK
 * cascade keeps the subtree together. `workspace` was retired by 0020: the
 * sandbox is a pond (#315), not a second scope axis.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NodeType } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { inPond, resolvePond } from '@/lib/pond/scope'
import { flushStagedDeletes } from '@/lib/deletion/staged-ids'
import { mapChangeLogRow } from '@/lib/change-log/store'
import type { ChangeLogRecord, ChangeLogRow } from '@/lib/change-log/types'
import { toBlocks } from './to-blocks'
import {
  ROW_TYPE,
  withSchema,
  withValue,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import { nextAvailableTitle, normalizeTitle, DuplicateTitleError } from './dedupe-title'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PondPage {
  id: string
  parentId: string | null
  type: NodeType
  title: string
  blocks: Block[]
  order: number
  /**
   * Typed page properties (#17): a jsonb object holding row values keyed by
   * property id, plus — on a collection page — the schema at the reserved
   * `_schema` key. Read the schema/values through `@/lib/properties/schema`
   * (readSchema/readValues); write it only via {@link setProperty}/
   * {@link defineSchema} so the reserved key is never clobbered.
   */
  props: Record<string, unknown>
}

export interface CreatePageInput {
  /**
   * #312: the pond the page belongs to. **Required.**
   *
   * It was optional, and that single `?` cost the guarantee #318 was chosen for:
   * none of the thirteen call sites passed one, so every page created in a second
   * pond was written into the person's FIRST pond and then filtered out of the
   * tree it was created in — orphaned in both. Required means tsc enumerates
   * every site, which is the whole point.
   *
   * Pass `null` ONLY where there is genuinely no pond to name, and expect the
   * row to be invisible in every pond until one is backfilled. Note 0019 does
   * NOT set `pond_id NOT NULL`, so the database will not catch a null for you.
   */
  pondId: string | null
  parentId?: string | null
  type?: NodeType
  title?: string
  blocks?: Block[]
  props?: Record<string, unknown>
  /**
   * Read the siblings and de-duplicate `title` BEFORE the first insert, so a
   * caller that expects a name collision (e.g. a database named after its host
   * page) never logs a 23505. The retry loop stays as the backstop for a race
   * that lands between this read and the insert.
   */
  preferFreeTitle?: boolean
}

/** A page returned by semantic search, with its cosine similarity to the query. */
export interface MatchedPage extends PondPage {
  similarity: number
}

/** Exported so a thin read elsewhere (KAN-448's `findPagesLinkingTo`) can map
 *  its own rows through the same `PAGE_COLUMNS`/{@link mapRow} pair rather than
 *  growing a second one. */
export type PageRow = {
  id: string
  parent_id: string | null
  type: NodeType
  title: string
  blocks: unknown
  props: unknown
  order: number
}

// `status` is a dormant legacy column (pre-unification vestige, never written):
// #17 makes status a select-typed *property* in `props`, not a first-class
// column — so it's deliberately absent here. The DB column is left in place but
// unread.
export const PAGE_COLUMNS = 'id, parent_id, type, title, blocks, props, "order"'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Props are stored as jsonb; coerce anything non-object (or array/null) to {}. */
function toProps(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function mapRow(row: PageRow): PondPage {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    type: row.type,
    title: row.title,
    blocks: toBlocks(row.blocks),
    props: toProps(row.props),
    order: row.order ?? 0,
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * A single page by id, or null if it doesn't exist. Throws on a Supabase
 * error (network/RLS) instead of swallowing it as a false "doesn't exist" —
 * `['page', id]`'s own queryFn (`page-query.ts`) depends on this so
 * react-query's `isError` can tell "the row is gone" (null) apart from "the
 * fetch failed" (thrown). Every other caller already treats a null return as
 * "not found" and reacts accordingly (throws its own error, or no-ops) — a
 * thrown fetch error reaches the same catch/propagation path unchanged.
 *
 * Exception: Postgres `22P02` (invalid_text_representation) means `id` isn't
 * a well-formed uuid — a hand-typed `?node=` value, never a transient
 * failure — so it reads as "not found" rather than an error react-query
 * would keep retrying forever.
 */
export async function getPage(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<PondPage | null> {
  const { data, error } = await supabase
    .from('pages')
    .select(PAGE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (error.code === '22P02') return null
    throw error
  }

  return data ? mapRow(data as PageRow) : null
}

/**
 * Direct child pages of a node, ordered by `order`. Pass `null` for the
 * top-level pages (those with no parent). A page may have zero, one, or many
 * children of any type.
 *
 * No pond filter: `parentId` is itself a page in one pond, so its children are
 * in that pond. Every caller passes a concrete id — `null` (top-level, which
 * WOULD cross ponds) is reached only from tests.
 */
export async function getChildPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string | null
): Promise<PondPage[]> {
  let query = supabase.from('pages').select(PAGE_COLUMNS).eq('user_id', userId)

  // PostgREST needs `.is()` for null, `.eq()` otherwise.
  query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId)

  const { data } = await query.order('order', { ascending: true })

  const rows = (data ?? []) as PageRow[]
  return rows.map(mapRow)
}

/**
 * A collection's rows (#19) — its `type='row'` child pages, full props included, in
 * `order`. The client-side counterpart of the assemble.ts read-hydration seam: a
 * view block fetches these to draw its table/board. Deliberately full-props (unlike
 * the lean `fetchPages` tree, which both strips `props` AND excludes `row` types) —
 * a view needs each row's typed values to render cells and bucket by group.
 */
export async function getCollectionRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  collectionId: string
): Promise<PondPage[]> {
  const children = await getChildPages(supabase, userId, collectionId)
  return children.filter((p) => p.type === ROW_TYPE)
}

/**
 * All of a user's pages as a flat list, ordered by `order`. The sidebar builds its
 * tree from this shape in memory; the AI create_page proposal card uses it to
 * populate the destination (parent) picker and to pre-resolve an AI-proposed parent
 * title to an id. Reads the same columns as the other list reads.
 *
 * #312: scoped to one pond. Unscoped this read reached across every pond, so the
 * parent picker offered another pond's pages and an AI-proposed parent title
 * could resolve to a page you cannot see from here.
 */
export async function listPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  pondId: string | null
): Promise<PondPage[]> {
  const pond = await resolvePond(supabase, userId, pondId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (supabase as any).from('pages').select(PAGE_COLUMNS).eq('user_id', userId)
  const { data } = await inPond(q, pond).order('order', { ascending: true })

  const rows = (data ?? []) as PageRow[]
  return rows.map(mapRow)
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * The `{id, title}` of every sibling under `parentId` (root when null) in a
 * pond — the scope `pages_sibling_title_pond_uniq` guards (#84, re-keyed by
 * 0019). Used to auto-suffix new titles and to detect rename collisions.
 */
async function siblingRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string | null,
  /** The page's own pond, already resolved: siblings are read where it lives. */
  pond: string | null
): Promise<{ id: string; title: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any).from('pages').select('id, title').eq('user_id', userId)
  // #312: 0018's `pages_sibling_title_pond_uniq` is keyed per pond, so the
  // auto-suffix must read THIS pond's siblings — otherwise it renames around a
  // name that does not collide.
  q = inPond(q, pond)
  q = parentId === null ? q.is('parent_id', null) : q.eq('parent_id', parentId)
  const { data } = await q
  return (data ?? []) as { id: string; title: string }[]
}

/** Reads `parentId`'s siblings and returns `desired` deduped against them (#84). */
async function dedupedTitle(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string | null,
  pond: string | null,
  desired: string
): Promise<string> {
  const siblings = await siblingRows(supabase, userId, parentId, pond)
  return nextAvailableTitle(
    desired || 'Untitled',
    siblings.map((s) => s.title)
  )
}

/** Create a page under a parent (or top-level when parentId is null/omitted). */
export async function createPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreatePageInput
): Promise<PondPage> {
  // KAN-273: commit every staged deletion first, so this read of the
  // siblings (below, for the unique-title check) can never see a row that is
  // mid-delete and dedupe around a name that isn't really taken.
  await flushStagedDeletes()
  const parentId = input.parentId ?? null
  const desired = input.title ?? ''

  // #312: `pondId` is required, so a caller that knows its pond says so. An
  // explicit `null` — a caller that genuinely has no pond — resolves the person's
  // first rather than writing null: a page with no pond shows in no pond.
  const pondId = await resolvePond(supabase, userId, input.pondId)

  const insert = {
    user_id: userId,
    ...(pondId ? { pond_id: pondId } : {}),
    parent_id: parentId,
    type: input.type ?? 'page',
    title: desired,
    blocks: input.blocks ?? [],
    props: input.props ?? {},
  }

  // `preferFreeTitle` callers expect a collision (e.g. a database named after
  // its host page), so they read the siblings and de-duplicate up front —
  // the happy path below still stays a single write. A blank title is exempt
  // from the unique index (#84), so it never collides — skip the pre-read and
  // insert it as-is, or a database made from an untitled page would be
  // renamed to "Untitled" for no reason.
  if (input.preferFreeTitle && desired !== '') {
    insert.title = await dedupedTitle(supabase, userId, parentId, pondId, desired)
  }

  // Insert first with the caller's title — the common case has no collision, so
  // the happy path stays a single write (blank/placeholder titles are exempt
  // from the unique index entirely, #84). ONLY on a sibling-name violation
  // (23505) do we read the siblings and auto-suffix (" 2", " 3", …) and retry —
  // the race backstop for everyone, and the only path for a caller that did not
  // ask `preferFreeTitle` to pre-check.
  for (let attempt = 0; attempt < 2; attempt++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pages')
      .insert(insert)
      .select('id')
      .single()

    if (!error && data) {
      return {
        id: data.id as string,
        parentId: insert.parent_id,
        type: insert.type,
        title: insert.title,
        blocks: insert.blocks as Block[],
        props: toProps(insert.props),
        order: 0,
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code !== '23505' || attempt === 1) {
      throw new Error(error?.message ?? 'Failed to create page')
    }
    insert.title = await dedupedTitle(supabase, userId, parentId, pondId, desired)
  }
  /* c8 ignore next */
  throw new Error('Failed to create page')
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

/**
 * Rename a page. A manual rename REJECTS a collision with an existing sibling
 * (rather than silently suffixing the way {@link createPage} does, #84), throwing
 * {@link DuplicateTitleError} for the caller to show inline. Two guards, in order:
 *
 *   1. A pre-check reads the target's sibling scope and throws on a case-
 *      insensitive title clash (excluding the page itself) BEFORE the write — so
 *      the rename is rejected even on a DB where the `pages_sibling_title_uniq`
 *      index isn't present (e.g. migration 0009 not yet applied).
 *   2. The 23505 mapping stays as the backstop for a race that slips between the
 *      pre-check read and the update.
 *
 * Blank titles are exempt from the index, so clearing a title never collides —
 * the pre-check is skipped for them.
 */
export async function updateTitle(
  supabase: SupabaseClient<Database>,
  id: string,
  title: string
): Promise<void> {
  // KAN-273: see createPage's comment — commit staged deletions before the
  // sibling-clash pre-check reads them.
  await flushStagedDeletes()
  const normalized = normalizeTitle(title)
  if (normalized !== '') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: self } = await (supabase as any)
      .from('pages')
      // #312: `pond_id` was MISSING here, so `self.pond_id` was always undefined
      // and the sibling lookup below skipped its pond clause — renaming a page
      // compared its title against every pond's siblings and refused names that do
      // not collide. `workspace` is gone (0020).
      .select('user_id, pond_id, parent_id')
      .eq('id', id)
      .maybeSingle()
    if (self) {
      const siblings = await siblingRows(
        supabase,
        self.user_id,
        self.parent_id,
        self.pond_id ?? null
      )
      const clashes = siblings.some((s) => s.id !== id && normalizeTitle(s.title) === normalized)
      if (clashes) throw new DuplicateTitleError(title.trim())
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any).code === '23505') throw new DuplicateTitleError(title.trim() || 'Untitled')
    throw new Error(error.message)
  }
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
 * Move a page in the tree (F25, KAN-466): set its `parent_id` (null =
 * top-level) and densely reindex the target sibling group so `order` is
 * `0..N-1` in the new visual order — which also repairs the legacy
 * all-zeros `order` state on first touch. `siblingOrder` is the full
 * ordered list of the target group's child ids AFTER the move (including
 * the moved node); the caller (computeMove) builds it. One round trip
 * through the `move_page` RPC (migration 0030) rather than a parent update
 * plus a `Promise.all` of per-row order updates: the reparent and the
 * reindex commit atomically, and the RPC's own `move` change_log record
 * comes back mapped, so the caller never has to write a second record for
 * what it just did.
 */
export async function movePage(
  supabase: SupabaseClient<Database>,
  input: { id: string; newParentId: string | null; siblingOrder: string[] }
): Promise<ChangeLogRecord> {
  // KAN-273: see createPage's comment — the caller's computed `siblingOrder`
  // must not include a row that is mid-delete.
  await flushStagedDeletes()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('move_page', {
    p_page_id: input.id,
    p_new_parent_id: input.newParentId,
    p_sibling_order: input.siblingOrder,
  })

  if (error) throw new Error(error.message)

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error(`move_page: moving page ${input.id} returned no record`)
  return mapChangeLogRow(row as ChangeLogRow)
}

/**
 * Duplicate a page and everything inside it (KAN-468): the deduped root
 * title is computed here, same `dedupedTitle`/`siblingRows` pattern
 * {@link createPage} uses, so the RPC (migration 0032) never has to read
 * siblings itself — it just commits the copy atomically with the title this
 * call already resolved, mirroring `movePage`'s own client-computes/RPC-
 * commits split. The resolved title rides along on the return value (AUDIT
 * G9) so a caller can navigate to the copy by its OWN title ("Recipes 2"),
 * not the source's — the RPC's own change-log `after` only carries the new
 * root's id, never its title.
 */
export async function duplicatePage(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<ChangeLogRecord & { title: string }> {
  // KAN-273: see createPage's comment — the sibling read just below must not
  // see a row that is mid-delete.
  await flushStagedDeletes()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: self } = await (supabase as any)
    .from('pages')
    .select('title, parent_id, pond_id')
    .eq('id', id)
    .maybeSingle()

  // A missing/foreign page has no siblings to dedupe against — the RPC's own
  // ownership check (`user_id = auth.uid()`) is what actually rejects it.
  const title = self
    ? await dedupedTitle(supabase, userId, self.parent_id ?? null, self.pond_id ?? null, self.title ?? '')
    : ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('duplicate_page', {
    p_page_id: id,
    p_title: title,
  })

  if (error) throw new Error(error.message)

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error(`duplicate_page: duplicating page ${id} returned no record`)
  return { ...mapChangeLogRow(row as ChangeLogRow), title }
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
    props: toProps(r.props),
    order: 0,
    similarity: r.similarity as number,
  }))
}

// ── Property writes (#17) ─────────────────────────────────────────────────────

/**
 * Overwrite a page's entire `props` object (schema + values). Low-level and
 * whole-object, mirroring `saveBlocks` — prefer {@link setProperty} /
 * {@link defineSchema}, which read-modify-write through the merge helpers so the
 * reserved `_schema` key (and sibling values) can never be clobbered.
 */
export async function saveProps(
  supabase: SupabaseClient<Database>,
  id: string,
  props: Record<string, unknown>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pages')
    .update({ props, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Set one typed property value on a page (#17). Read-modify-write: fetches the
 * current `props`, merges the single value in via `withValue` (preserving
 * `_schema` and every sibling value), and persists. The primitive behind the
 * manual inspector, the `set_property` AI tool (planned, #19), and #19's optimistic edits.
 * No-op-safe: a missing page is ignored rather than throwing.
 */
export async function setProperty(
  supabase: SupabaseClient<Database>,
  id: string,
  key: string,
  value: PropertyValue
): Promise<void> {
  const page = await getPage(supabase, id)
  if (!page) return
  await saveProps(supabase, id, withValue(page.props, key, value))
}

/**
 * Define (or replace) a page's property schema (#17) — the act that makes a page
 * a collection (#18). Read-modify-write: merges the schema at the reserved
 * `_schema` key via `withSchema`, preserving every existing row value.
 * No-op-safe on a missing page.
 */
export async function defineSchema(
  supabase: SupabaseClient<Database>,
  id: string,
  schema: PropertySchema
): Promise<void> {
  const page = await getPage(supabase, id)
  if (!page) return
  await saveProps(supabase, id, withSchema(page.props, schema))
}
