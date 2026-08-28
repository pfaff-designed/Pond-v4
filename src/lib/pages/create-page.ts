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
import type { ModuleData } from '@/lib/modules/ai-composition'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { resolveSourceRef } from '@/lib/modules/same-batch-refs'
import { createPage } from '@/lib/pages/client'
import { resolveParentId } from '@/lib/nodes/create'

/**
 * Hydrate a full proposed block array in order — minting block-level and nested ids
 * and validating each block (shared `hydrateBlock`, the same gate the propose_changes
 * accept path uses). Malformed blocks are skipped (never written); block order is
 * preserved. The `mintId` closure is injected so the client supplies
 * `crypto.randomUUID` and tests supply a deterministic counter.
 */
export function hydrateProposalBlocks(data: ModuleData[], mintId: () => string): Block[] {
  const out: Block[] = []
  for (const item of data) {
    // create_page has no batch-local `key` mechanism (its blocks carry no keys), so
    // the ref map is empty: a metric that still names a `source.ref` here has no
    // resolvable target and the binding is dropped cleanly (falls back to manual)
    // rather than persisting an unresolved ref. Same-batch bindings are a
    // propose_changes affordance; the model is steered to plain `blockId` bindings
    // (or none) inside create_page.
    const block = hydrateBlock(resolveSourceRef(item, EMPTY_REFS), mintId(), mintId)
    if (block) out.push(block)
  }
  return out
}

const EMPTY_REFS: ReadonlyMap<string, string> = new Map()

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
  /** Id-less scaffolded blocks the AI proposed. */
  blocks: ModuleData[]
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
  mintId: () => string
): Promise<CreatedPage> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const ref = proposal.parentRef?.trim()
  const parentId = ref ? await resolveParentId(sb, user.id, ref) : null

  const blocks = hydrateProposalBlocks(proposal.blocks, mintId)

  const props = proposal.kind ? { kind: proposal.kind } : {}

  const page = await createPage(supabase, user.id, {
    parentId,
    type: proposal.type,
    title: proposal.title,
    blocks,
    props,
  })
  return { id: page.id }
}
