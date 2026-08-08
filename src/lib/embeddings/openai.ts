/**
 * OpenAI embedding wrapper (Track D — semantic search).
 *
 * The only network I/O in the embedding path. Kept dependency-light and
 * framework-agnostic; the surrounding orchestration (documentText / embedDocument
 * / retrieveDocuments) is what the rest of the app calls. Verified live against
 * the OpenAI API, not unit-tested (network boundary).
 */

import OpenAI from 'openai'

/** text-embedding-3-small → 1536 dims, matching the documents.embedding column. */
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    client = new OpenAI({ apiKey })
  }
  return client
}

/**
 * Embed a single string. Returns null for empty/whitespace input — there is
 * nothing to embed, and callers should skip the write rather than store a zero
 * vector that would pollute similarity search.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  })

  return res.data[0].embedding
}
