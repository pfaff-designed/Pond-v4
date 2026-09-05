/**
 * The AI `create_page` accept path (M1) — framework-agnostic domain logic.
 *
 * A `create_page` tool call is client-resolved (no execute): the model proposes a
 * brand-new page (type + optional kind + title + a proposed parent + id-less
 * scaffolded blocks), the user reviews it on a proposal card, and ONLY on accept do
 * we write. This module owns that write:
 *
 *   1. hydrateProposalBlocks — mint ids (block-level AND nested, e.g. todo items)
 *      for the id-less module data the AI emits, re-validating each block against
 *      `blockSchema` so a malformed block is skipped, never written (mirrors the
 *      accept-time gate in pages/edits.ts — the AI never mints ids, branch 2/7).
 *   2. createPageFromProposal — resolve the proposed parent (UUID or title, reusing
 *      nodes/create.resolveParentId so structural + content creation share one
 *      resolver) and insert via pages/client.createPage, carrying page-kind in
 *      `props.kind` (the coarse `type` enum is unchanged).
 *
 * No Next.js imports — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NodeType } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { CreatePageBlock } from '@/lib/modules/ai-composition'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { collectBatchRefIds, resolveSourceRef } from '@/lib/modules/same-batch-refs'
import { createPage, getPage, defineSchema } from '@/lib/pages/client'
import { resolveParentId } from '@/lib/nodes/create'
import {
  propertyDefSchema,
  readSchema,
  isCollection,
  coerceValue,
  resolveOptionValue,
  ROW_TYPE,
  type AiPropertyDef,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'

/**
 * Hydrate a full proposed block array in order — minting block-level and nested ids
 * and validating each block (shared `hydrateBlock`, the same gate the propose_changes
 * accept path uses). Malformed blocks are skipped (never written); block order is
 * preserved. The `mintId` closure is injected so the client supplies
 * `crypto.randomUUID` and tests supply a deterministic counter.
 *
 * Same-batch bindings (ticket-31): a block entry may carry a `bindKey`, and a metric
 * in the same proposal may bind to it via `source: { ref: <bindKey>, kind }` — so an
 * AI-scaffolded page is born with LIVE metrics (the original audit finding was
 * exactly a create_page metric that could not bind to its own checklist). The whole
 * proposal lands atomically here, so this is the simple single-pass case: keys map
 * only for entries that pass validation (a skipped block can't be a binding target);
 * an unknown ref drops the binding (metric lands manual, never dangling). `bindKey`
 * is authoring-only — `hydrateBlock`'s schema validation strips it from what
 * persists.
 */
export function hydrateProposalBlocks(data: CreatePageBlock[], mintId: () => string): Block[] {
  const refs = collectBatchRefIds(
    data.map((b) => ({ bindKey: b.bindKey, data: b })),
    mintId
  )
  const out: Block[] = []
  for (const item of data) {
    const id = (item.bindKey ? refs.get(item.bindKey) : undefined) ?? mintId()
    const block = hydrateBlock(resolveSourceRef(item, refs), id, mintId)
    if (block) out.push(block)
  }
  return out
}

/** A create_page proposal after the user has (optionally) corrected its placement. */
export interface CreatePageProposal {
  type: NodeType
  /** Page-kind (recipe | document | inventory | dashboard | note | …). Structural
   *  types may omit it — it is stored in `props.kind`, not the coarse `type` enum. */
  kind?: string
  title: string
  /** The chosen parent, as a page UUID OR a page title to resolve (resolveParentId
   *  accepts either), or null = top-level. The AI proposes a title; the client may
   *  substitute a picked page id — both flow through here. */
  parentRef?: string | null
  /** Id-less scaffolded blocks the AI proposed (each may carry a `bindKey`). */
  blocks: CreatePageBlock[]
}

export interface CreatedPage {
  id: string
}

/**
 * Write an accepted create_page proposal. Resolves the parent (UUID or title),
 * hydrates the blocks (minting ids), and inserts the row with `props.kind` set when
 * a kind is present. Throws when unauthenticated or when the parent title can't be
 * resolved (surfaced to the user rather than silently writing at top-level).
 */
export async function createPageFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: CreatePageProposal,
  mintId: () => string,
  workspace: WorkspaceScope = 'main'
): Promise<CreatedPage> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const ref = proposal.parentRef?.trim()
  const parentId = ref ? await resolveParentId(sb, user.id, ref, workspace) : null

  const blocks = hydrateProposalBlocks(proposal.blocks, mintId)

  const props = proposal.kind ? { kind: proposal.kind } : {}

  const page = await createPage(supabase, user.id, {
    parentId,
    type: proposal.type,
    title: proposal.title,
    blocks,
    props,
    workspace,
  })
  return { id: page.id }
}

// ── define_schema accept path (#17 slice 5) ─────────────────────────────────
//
// A `define_schema` tool call is client-resolved (no execute), exactly like
// create_page: the model proposes turning an EXISTING page into a collection by
// giving it a property schema (id-less, since the model never mints stable ids),
// the user reviews it on a proposal card, and ONLY on accept do we write. This
// mirror owns that write:
//
//   1. hydratePropertySchema — mint any missing property AND option ids for the
//      id-less schema the AI emits, re-validating each def against the strict
//      `propertyDefSchema` so a malformed property is skipped, never written
//      (the same gate hydrateProposalBlocks applies to blocks).
//   2. defineSchemaFromProposal — confirm the target page exists, then persist
//      through the merge-safe `defineSchema` client fn (which uses `withSchema`,
//      so existing row values alongside the schema are never clobbered).

/**
 * Hydrate an id-less AI property schema into a persistable {@link PropertySchema}:
 * mint an id for every property and every option that lacks one (the AI never
 * mints ids — a rename must never orphan the rows pointing at an option), then
 * validate each def against `propertyDefSchema`. A malformed def is skipped, not
 * written (mirrors block hydration); property order is preserved. The `mintId`
 * closure is injected so the client supplies `crypto.randomUUID` and tests a
 * deterministic counter.
 *
 * `resolveCollectionName` (#20) turns a relation's proposed `target` — a collection
 * NAME the model wrote — into the collection's stable id, exactly as configure_view
 * resolves a group-by name. An unresolvable name (or no resolver) drops the target:
 * the relation stays untargeted (an unscoped "link any page"), never a hard fail.
 * `target` is relation-only — it never rides on another property type.
 */
export function hydratePropertySchema(
  defs: AiPropertyDef[],
  mintId: () => string,
  resolveCollectionName?: (name: string) => string | undefined
): PropertySchema {
  const out: PropertyDef[] = []
  for (const raw of defs) {
    const candidate = {
      ...raw,
      id: raw.id ?? mintId(),
      ...(raw.options ? { options: raw.options.map((o) => ({ ...o, id: o.id ?? mintId() })) } : {}),
    }
    const parsed = propertyDefSchema.safeParse(candidate)
    if (!parsed.success) continue
    const def = parsed.data
    if (def.type === 'relation') {
      const resolved =
        def.target && resolveCollectionName ? resolveCollectionName(def.target) : undefined
      if (resolved) def.target = resolved
      else delete def.target
    } else {
      delete def.target
    }
    out.push(def)
  }
  return out
}

/** A define_schema proposal after the user has (optionally) corrected its target. */
export interface DefineSchemaProposal {
  /** The page the schema is applied to — makes it a collection (#18). */
  pageId: string
  /** The id-less property schema the AI proposed. */
  schema: AiPropertyDef[]
}

/**
 * Write an accepted define_schema proposal. Confirms the target page exists
 * (throws otherwise, so the card can revert rather than silently no-op), hydrates
 * the schema (minting property/option ids), and merges it in via the merge-safe
 * `defineSchema` — every existing row value alongside the schema is preserved.
 * Returns the hydrated schema so the caller can seed its page cache optimistically.
 */
export async function defineSchemaFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: DefineSchemaProposal,
  mintId: () => string,
  resolveCollectionName?: (name: string) => string | undefined
): Promise<PropertySchema> {
  const page = await getPage(supabase, proposal.pageId)
  if (!page) throw new Error(`Cannot define a schema: page ${proposal.pageId} was not found`)
  const schema = hydratePropertySchema(proposal.schema, mintId, resolveCollectionName)
  await defineSchema(supabase, proposal.pageId, schema)
  return schema
}

/** A minimal page shape for resolving a relation target NAME→id at the accept site. */
export interface CollectionCandidate {
  id: string
  title: string
  props?: Record<string, unknown> | null
}

/**
 * Build the `resolveCollectionName` resolver `hydratePropertySchema` takes (#20
 * slice 2b). Given the workspace's pages (the accept site feeds the full
 * `['pages', workspace, 'full']` cache — the one that carries `props`), returns a
 * closure mapping a relation's proposed target NAME to the id of the first
 * COLLECTION whose title matches case-insensitively. A relation target IS a
 * collection (spec decision 1), so non-collections are excluded — including rows,
 * which never carry a `_schema`. A blank/unknown name, or one matching only a
 * non-collection page, returns undefined → the relation stays untargeted (lenient).
 */
export function collectionNameResolver(
  pages: CollectionCandidate[]
): (name: string) => string | undefined {
  const collections = pages.filter((p) => isCollection(p.props))
  return (name: string) => {
    const key = name.trim().toLowerCase()
    if (!key) return undefined
    return collections.find((p) => p.title.trim().toLowerCase() === key)?.id
  }
}

// ── add_row accept path (#18) ────────────────────────────────────────────────
//
// An `add_row` tool call is client-resolved (no execute), exactly like
// define_schema: the model proposes ONE new row for an EXISTING collection — its
// values keyed by property NAME (the model never mints the stable property/option
// ids) — the user reviews it on a proposal card, and ONLY on accept do we write.
// This mirror owns that write:
//
//   1. resolveRowValues — map each proposed { name: value } onto the collection's
//      schema: match the property by name (case-insensitive), coerce the value to
//      its type (coerceValue — lenient, a bad value collapses to empty), and key
//      it by the property's stable id. Names not in the schema are dropped.
//   2. addRowFromProposal — confirm the target exists AND is a collection, then
//      create a `type='row'` child page carrying the resolved value map as its
//      props (NEVER a _schema — a row is not itself a collection).

/**
 * Resolve an AI-proposed name→value map into a persistable { propertyId: value }
 * row-value map, against a collection's schema. Matches each proposed key to a
 * property by name (case-insensitive, first def wins on a duplicate name) and
 * coerces the value to that property's type. Unknown names are dropped and bad
 * values collapse to empty — conversational authoring must never hard-fail
 * (#18 decision 9). The result carries values only, never the reserved _schema.
 */
export function resolveRowValues(
  schema: PropertySchema,
  proposed: Record<string, unknown>
): Record<string, PropertyValue> {
  const byName = new Map<string, PropertyDef>()
  for (const def of schema) {
    const key = def.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, def)
  }
  const values: Record<string, PropertyValue> = {}
  for (const [name, raw] of Object.entries(proposed)) {
    const def = byName.get(name.trim().toLowerCase())
    if (!def) continue // property name not in the schema — dropped (lenient)
    // select/status store the option *id* (rename-safe); the model proposes the
    // label, so resolve label→id here — mirroring the name→id resolution above.
    values[def.id] =
      def.type === 'select' || def.type === 'status'
        ? resolveOptionValue(def, raw)
        : coerceValue(def, raw)
  }
  return values
}

/** An add_row proposal after the user has (optionally) corrected its target. */
export interface AddRowProposal {
  /** The collection the row is added to (a page carrying a `_schema`). */
  collectionId: string
  /** The new row's title (its page title). */
  title?: string
  /** The proposed values, keyed by property NAME (resolved to ids on accept). */
  props: Record<string, unknown>
}

/**
 * Write an accepted add_row proposal. Confirms the target page exists AND is a
 * collection (throws otherwise, so the card can revert rather than silently
 * no-op), resolves the proposed name→value map against the collection's schema,
 * and creates a `type='row'` child page carrying those coerced values. The row's
 * props hold ONLY values — never a `_schema` (a row is not itself a collection).
 */
export async function addRowFromProposal(
  supabase: SupabaseClient<Database>,
  proposal: AddRowProposal,
  workspace: WorkspaceScope = 'main'
): Promise<CreatedPage> {
  const collection = await getPage(supabase, proposal.collectionId)
  if (!collection) {
    throw new Error(`Cannot add a row: collection ${proposal.collectionId} was not found`)
  }
  const schema = readSchema(collection.props)
  if (!schema) {
    throw new Error(
      `Cannot add a row: page ${proposal.collectionId} is not a collection (it has no schema)`
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const values = resolveRowValues(schema, proposal.props)
  const page = await createPage(supabase, user.id, {
    parentId: proposal.collectionId,
    type: ROW_TYPE,
    title: proposal.title ?? '',
    props: values,
    workspace,
  })
  return { id: page.id }
}
