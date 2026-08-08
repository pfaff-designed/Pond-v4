/**
 * Document embedding orchestration (Track D — semantic search).
 *
 * Composes the pure text flattening (documentText) with the OpenAI wrapper and
 * the persistence layer so a document's content and its embedding stay in sync.
 * Reuses blocksToText — the SAME flattening the prompt-injection path (Track C)
 * uses — so what retrieval matches on is exactly what the AI reads.
 *
 * documentText is pure (unit-tested); embedDocument is the network+DB path
 * (verified live).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { blocksToText } from '@/lib/context/assemble'
import { updateEmbedding } from '@/lib/documents/client'
import { embedText } from './openai'

/**
 * The embeddable text for a document: its title followed by the flattened
 * block content. Pure — no I/O. Returns '' when there is nothing to embed.
 */
export function documentText(title: string, blocks: Block[]): string {
  const body = blocksToText(blocks)
  return [title.trim(), body].filter(Boolean).join('\n')
}

/**
 * Embed a document's content and persist the vector. No-op returning false when
 * the document has no embeddable text (empty title + empty blocks); returns true
 * once the embedding is written.
 */
export async function embedDocument(
  sb: SupabaseClient<Database>,
  doc: { id: string; title: string; blocks: Block[] }
): Promise<boolean> {
  const text = documentText(doc.title, doc.blocks)
  const embedding = await embedText(text)
  if (!embedding) return false

  await updateEmbedding(sb, doc.id, embedding)
  return true
}
