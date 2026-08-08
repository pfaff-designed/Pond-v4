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
import { getDocumentsForNode } from '@/lib/documents/client'
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
}

/** Render a node's assembled context as a compact block for the system prompt. */
export function formatNodeContext(data: NodeContextData, opts: { label?: string } = {}): string {
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

/** Table + own-title column for each node type. */
const NODE_TABLE: Record<NodeType, { table: string; titleCol: string; hasStatus: boolean }> = {
  area: { table: 'areas', titleCol: 'name', hasStatus: false },
  routine: { table: 'routines', titleCol: 'name', hasStatus: false },
  project: { table: 'projects', titleCol: 'title', hasStatus: true },
  action: { table: 'actions', titleCol: 'title', hasStatus: true },
}

/**
 * Fetch a node's own metadata, its documents, and its direct children.
 * Returns null if the node can't be found (e.g. wrong id / not owned by user).
 */
export async function fetchNodeContext(
  sb: Sb,
  userId: string,
  nodeId: string,
  nodeType: NodeType
): Promise<NodeContextData | null> {
  const meta = NODE_TABLE[nodeType]
  const select = meta.hasStatus ? `${meta.titleCol}, status` : meta.titleCol

  const { data: own } = await sb
    .from(meta.table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select(select as any)
    .eq('id', nodeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!own) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownRow = own as any

  const documents = (await getDocumentsForNode(sb, userId, nodeId, nodeType)).map((d) => ({
    title: d.title,
    blocks: d.blocks,
  }))

  const children = await fetchChildren(sb, userId, nodeId, nodeType)

  return {
    type: nodeType,
    title: ownRow[meta.titleCol] as string,
    status: meta.hasStatus ? (ownRow.status as string | undefined) : undefined,
    documents,
    children,
  }
}

async function fetchChildren(
  sb: Sb,
  userId: string,
  nodeId: string,
  nodeType: NodeType
): Promise<ChildSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = sb as any
  const children: ChildSummary[] = []

  if (nodeType === 'area') {
    const [routines, projects, actions] = await Promise.all([
      q.from('routines').select('name').eq('user_id', userId).eq('area_id', nodeId),
      q.from('projects').select('title, status').eq('user_id', userId).eq('area_id', nodeId),
      q.from('actions').select('title, status').eq('user_id', userId).eq('area_id', nodeId),
    ])
    for (const r of routines.data ?? []) children.push({ type: 'routine', title: r.name })
    for (const p of projects.data ?? [])
      children.push({ type: 'project', title: p.title, status: p.status })
    for (const a of actions.data ?? [])
      children.push({ type: 'action', title: a.title, status: a.status })
  } else if (nodeType === 'project') {
    const { data } = await q
      .from('actions')
      .select('title, status')
      .eq('user_id', userId)
      .eq('project_id', nodeId)
    for (const a of data ?? []) children.push({ type: 'action', title: a.title, status: a.status })
  } else {
    // routine or action → sub-actions via polymorphic parent
    const { data } = await q
      .from('actions')
      .select('title, status')
      .eq('user_id', userId)
      .eq('parent_id', nodeId)
      .eq('parent_type', nodeType)
    for (const a of data ?? []) children.push({ type: 'action', title: a.title, status: a.status })
  }

  return children
}

/** Search all node tables for a node whose name/title matches (case-insensitive). */
export async function resolveMention(
  sb: Sb,
  userId: string,
  name: string
): Promise<MentionRef | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = sb as any
  const order: NodeType[] = ['area', 'project', 'routine', 'action']

  for (const type of order) {
    const meta = NODE_TABLE[type]
    const { data } = await q
      .from(meta.table)
      .select(`id, ${meta.titleCol}`)
      .eq('user_id', userId)
      .ilike(meta.titleCol, name)
      .limit(1)
      .maybeSingle()
    if (data) return { name, nodeId: data.id as string, nodeType: type }
  }
  return null
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

  if (opts.nodeId && opts.nodeType) {
    const data = await fetchNodeContext(sb, userId, opts.nodeId, opts.nodeType)
    if (data) blocks.push(formatNodeContext(data))
  }

  if (opts.latestUserText) {
    for (const name of parseMentions(opts.latestUserText)) {
      const ref = await resolveMention(sb, userId, name)
      if (!ref) continue
      const data = await fetchNodeContext(sb, userId, ref.nodeId, ref.nodeType)
      if (data) blocks.push(formatNodeContext(data, { label: `Referenced: @${ref.name}` }))
    }
  }

  return blocks.join('\n\n')
}
