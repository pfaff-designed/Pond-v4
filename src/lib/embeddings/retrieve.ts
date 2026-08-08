/**
 * Cross-space document retrieval (Track D — semantic search / RAG).
 *
 * Embeds an explicit query and returns the most similar documents across the
 * user's whole workspace. Per ticket-06 §Retrieval, this fires ONLY on an
 * explicit cross-space query (the fetch_context tool) — never as background
 * retrieval on every turn.
 *
 * retrieveDocuments is the network+DB path (verified live); formatRetrievedDocs
 * is pure (unit-tested) and reuses blocksToText so a retrieved document reads
 * the same way the auto-injected current node does (Track C).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { blocksToText } from '@/lib/context/assemble'
import { matchDocuments, type MatchedDocument } from '@/lib/documents/client'
import { embedText } from './openai'

export interface RetrieveOptions {
  /** How many documents to return (default 5). */
  matchCount?: number
  /** Drop matches below this cosine similarity (default 0 — return top-k as-is). */
  minSimilarity?: number
}

/**
 * Embed the query and return the most similar documents. Returns [] for an
 * empty query (nothing to embed).
 */
export async function retrieveDocuments(
  sb: SupabaseClient<Database>,
  userId: string,
  queryText: string,
  opts: RetrieveOptions = {}
): Promise<MatchedDocument[]> {
  const embedding = await embedText(queryText)
  if (!embedding) return []

  const docs = await matchDocuments(sb, userId, embedding, opts.matchCount ?? 5)
  const min = opts.minSimilarity ?? 0
  return min > 0 ? docs.filter((d) => d.similarity >= min) : docs
}

/**
 * Render retrieved documents as a compact context block for the fetch_context
 * tool result — the string the model reads. Pure.
 */
export function formatRetrievedDocs(docs: MatchedDocument[]): string {
  if (docs.length === 0) return 'No matching documents found in the workspace.'

  const lines: string[] = ['[Retrieved from workspace]']
  for (const doc of docs) {
    const body = blocksToText(doc.blocks)
    const title = doc.title || 'Untitled'
    lines.push(body ? `- "${title}": ${body}` : `- "${title}"`)
  }
  return lines.join('\n')
}
