/**
 * Persistence layer for documents (block arrays attached to a node or free-floating).
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js imports. Follows the
 * cast-to-any pattern established in lib/conversation/client.ts for insert/update
 * chains (Supabase's generated types don't narrow well through the builder).
 *
 * Design notes (from build-brief.md §7–8):
 *   - A node may have multiple documents (fetch_context returns Block[][]).
 *   - The entire block array is written on save — no partial block updates.
 *   - node_id null = free-floating document.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NodeType } from '@/lib/supabase/types'
import type { Block } from './types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PondDocument {
  id: string
  nodeId: string | null
  nodeType: NodeType | null
  title: string
  blocks: Block[]
}

export interface CreateDocumentInput {
  nodeId?: string
  nodeType?: NodeType
  title?: string
  blocks?: Block[]
}

type DocumentRow = {
  id: string
  node_id: string | null
  node_type: NodeType | null
  title: string
  blocks: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Blocks are stored as jsonb; coerce anything non-array to []. */
function toBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : []
}

function mapRow(row: DocumentRow): PondDocument {
  return {
    id: row.id,
    nodeId: row.node_id ?? null,
    nodeType: row.node_type ?? null,
    title: row.title,
    blocks: toBlocks(row.blocks),
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * All documents attached to a given node, most recently updated first.
 * A node may legitimately have zero, one, or several documents.
 */
export async function getDocumentsForNode(
  supabase: SupabaseClient<Database>,
  userId: string,
  nodeId: string,
  nodeType: NodeType
): Promise<PondDocument[]> {
  const { data } = await supabase
    .from('documents')
    .select('id, node_id, node_type, title, blocks')
    .eq('user_id', userId)
    .eq('node_id', nodeId)
    .eq('node_type', nodeType)
    .order('updated_at', { ascending: false })

  const rows = (data ?? []) as DocumentRow[]
  return rows.map(mapRow)
}

/** A single document by id, or null if it doesn't exist. */
export async function getDocument(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<PondDocument | null> {
  const { data } = await supabase
    .from('documents')
    .select('id, node_id, node_type, title, blocks')
    .eq('id', id)
    .maybeSingle()

  return data ? mapRow(data as DocumentRow) : null
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Create a document, either attached to a node or free-floating (no node). */
export async function createDocument(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateDocumentInput
): Promise<PondDocument> {
  const insert = {
    user_id: userId,
    node_id: input.nodeId ?? null,
    node_type: input.nodeType ?? null,
    title: input.title ?? '',
    blocks: input.blocks ?? [],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('documents')
    .insert(insert)
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create document')

  return {
    id: data.id as string,
    nodeId: insert.node_id,
    nodeType: insert.node_type,
    title: insert.title,
    blocks: insert.blocks as Block[],
  }
}

/**
 * Overwrite a document's entire block array. Per the spec, blocks are never
 * partially updated — the whole array is written on save.
 */
export async function saveBlocks(
  supabase: SupabaseClient<Database>,
  id: string,
  blocks: Block[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('documents')
    .update({ blocks, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Rename a document. */
export async function updateTitle(
  supabase: SupabaseClient<Database>,
  id: string,
  title: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('documents')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}
