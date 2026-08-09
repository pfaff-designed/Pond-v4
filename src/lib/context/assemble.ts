/**
 * Context assembly for the AI terminal (Track C).
 *
 * Two retrieval surfaces, per ticket-04 §"Context scoping" and ticket-06
 * §"Retrieval (RAG)":
 *   1. Auto-injection — the currently open node + its direct children are
 *      injected into the prompt automatically on every message.
 *   2. @mention — cross-space context, pulled on demand when the user references
 *      another node by name. (The AI never fetches cross-space context itself.)
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
import type { Block } from '@/lib/documents/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChildSummary {
  type: NodeType
  title: string
  status?: string
}

export interface NodeContextData {
  type: NodeType
  title: string
  status?: string
  documents: { title: string; blocks: Block[] }[]
  children: ChildSummary[]
}

export interface MentionRef {
  name: string
  nodeId: string
  nodeType: NodeType
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
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.content
        case 'todo':
          return block.items
            .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.label}`)
            .join('\n')
        case 'metric':
          return `${block.label}: ${block.value}${block.unit ? ` ${block.unit}` : ''}`
        default:
          return ''
      }
    })
    .filter((line) => line.length > 0)
    .join('\n')
}

// ── formatNodeContext (pure) ─────────────────────────────────────────────────

const TYPE_LABEL: Record<NodeType, string> = {
  area: 'Area',
  routine: 'Routine',
  project: 'Project',
  action: 'Action',
  page: 'Page',
}

/** One-line preview of a block's content, for the id-addressed listing. */
function blockPreview(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.content
    case 'todo':
      return block.items.map((it) => it.label).join(', ')
    case 'metric':
      return `${block.label}: ${block.value}${block.unit ? ` ${block.unit}` : ''}`
    default:
      return ''
  }
}

/**
 * Render a node's assembled context as a compact block for the system prompt.
 *
 * `includeBlockIds` surfaces each editable block's stable id so the model can
 * target a specific block in a `propose_edit` call (Slice 2). Only the
 * auto-injected current node opts in — @mentioned nodes are not editable
 * targets, so they omit ids to keep the prompt clean and unambiguous.
 */
export function formatNodeContext(
  data: NodeContextData,
  opts: { label?: string; includeBlockIds?: boolean } = {}
): string {
  const lines: string[] = []
  lines.push(`[${opts.label ?? 'Current node'}]`)

  const status = data.status ? ` (${data.status})` : ''
  lines.push(`${TYPE_LABEL[data.type]}: ${data.title}${status}`)

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
    const blocks = data.documents.flatMap((doc) => doc.blocks)
    if (blocks.length > 0) {
      lines.push('Editable blocks (reference a block by its id when proposing an edit):')
      for (const block of blocks) {
        const preview = blockPreview(block)
        lines.push(`  - [${block.id}] (${block.type})${preview ? ` ${preview}` : ''}`)
      }
    }
  }

  if (data.children.length > 0) {
    lines.push('Children:')
    for (const child of data.children) {
      const cs = child.status ? ` (${child.status})` : ''
      lines.push(`  - ${TYPE_LABEL[child.type]}: ${child.title}${cs}`)
    }
  }

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
  nodeId: string
): Promise<NodeContextData | null> {
  const { data: own } = await sb
    .from('pages')
    .select('type, title, status, blocks')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!own) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = own as any

  const blocks: Block[] = Array.isArray(row.blocks) ? (row.blocks as Block[]) : []
  const documents = blocks.length ? [{ title: row.title as string, blocks }] : []

  const children = await fetchChildren(sb, userId, nodeId)

  return {
    type: row.type as NodeType,
    title: row.title as string,
    status: (row.status as string | null) ?? undefined,
    documents,
    children,
  }
}

/** Direct child pages of a node — one query, any type, arbitrary depth. */
async function fetchChildren(sb: Sb, userId: string, nodeId: string): Promise<ChildSummary[]> {
  const pages = await getChildPages(sb, userId, nodeId)
  return pages.map((p) => ({ type: p.type, title: p.title, status: p.status ?? undefined }))
}

/** Find a page whose title matches (case-insensitive) — single table now. */
export async function resolveMention(
  sb: Sb,
  userId: string,
  name: string
): Promise<MentionRef | null> {
  const { data } = await sb
    .from('pages')
    .select('id, type')
    .eq('user_id', userId)
    .ilike('title', name)
    .limit(1)
    .maybeSingle()

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
}

/**
 * Assemble the full context string to prepend to the system prompt for a chat
 * turn: the current node (auto-injected) plus any @mentioned nodes. Returns ''
 * when there is nothing to inject.
 */
export async function buildChatContext(
  sb: Sb,
  userId: string,
  opts: BuildChatContextOptions
): Promise<string> {
  const blocks: string[] = []

  if (opts.nodeId) {
    const data = await fetchNodeContext(sb, userId, opts.nodeId)
    // Current node only: expose block ids so the model can target one in propose_edit.
    if (data) blocks.push(formatNodeContext(data, { includeBlockIds: true }))
  }

  if (opts.latestUserText) {
    for (const name of parseMentions(opts.latestUserText)) {
      const ref = await resolveMention(sb, userId, name)
      if (!ref) continue
      const data = await fetchNodeContext(sb, userId, ref.nodeId)
      if (data) blocks.push(formatNodeContext(data, { label: `Referenced: @${ref.name}` }))
    }
  }

  return blocks.join('\n\n')
}
