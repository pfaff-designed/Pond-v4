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
  type AiPropertyDef,
  type PropertyDef,
  type PropertySchema,
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
 */
export function hydratePropertySchema(defs: AiPropertyDef[], mintId: () => string): PropertySchema {
  const out: PropertyDef[] = []
  for (const raw of defs) {
    const candidate = {
      ...raw,
      id: raw.id ?? mintId(),
      ...(raw.options ? { options: raw.options.map((o) => ({ ...o, id: o.id ?? mintId() })) } : {}),
    }
    const parsed = propertyDefSchema.safeParse(candidate)
    if (parsed.success) out.push(parsed.data)
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
  mintId: () => string
): Promise<PropertySchema> {
  const page = await getPage(supabase, proposal.pageId)
  if (!page) throw new Error(`Cannot define a schema: page ${proposal.pageId} was not found`)
  const schema = hydratePropertySchema(proposal.schema, mintId)
  await defineSchema(supabase, proposal.pageId, schema)
  return schema
}
