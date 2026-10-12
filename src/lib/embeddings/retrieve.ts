/**
 * Cross-space document retrieval (Track D — semantic search / RAG).
 *
 * Embeds an explicit query and returns the most similar pages in the asking
 * pond. Per ticket-06 §Retrieval, this fires ONLY on an
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
import { matchPages, type MatchedPage } from '@/lib/pages/client'
import { inPond, resolvePond } from '@/lib/pond/scope'
import { embedText } from './openai'

/**
 * How many nearest pages to rank before keeping only the asking pond's. The
 * `match_pages` RPC takes no pond, so another pond's closer pages would otherwise
 * crowd this pond's out of a top-5.
 */
const POND_CANDIDATES = 25

export interface RetrieveOptions {
  /** How many pages to return (default 5). */
  matchCount?: number
  /** Drop matches below this cosine similarity (default 0 — return top-k as-is). */
  minSimilarity?: number
}

/**
 * Embed the query and return this pond's most similar pages (`Pond 06.13`
 * `s6m5`: the composer reads only this pond). Returns [] for an empty query
 * (nothing to embed).
 */
export async function retrievePages(
  sb: SupabaseClient<Database>,
  userId: string,
  pondId: string | null,
  queryText: string,
  opts: RetrieveOptions = {}
): Promise<MatchedPage[]> {
  const embedding = await embedText(queryText)
  if (!embedding) return []

  const count = opts.matchCount ?? 5
  const candidates = await matchPages(sb, userId, embedding, Math.max(count, POND_CANDIDATES))
  if (candidates.length === 0) return []

  const pond = await resolvePond(sb, userId, pondId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (sb as any)
    .from('pages')
    .select('id')
    .eq('user_id', userId)
    .in(
      'id',
      candidates.map((p) => p.id)
    )
  const { data, error } = await inPond(q, pond)
  if (error) throw new Error(error.message)
  const inThisPond = new Set(((data ?? []) as { id: string }[]).map((r) => r.id))

  const min = opts.minSimilarity ?? 0
  return candidates.filter((p) => inThisPond.has(p.id) && p.similarity >= min).slice(0, count)
}

/**
 * Render retrieved pages as a compact context block for the fetch_context tool
 * result — the string the model reads. Pure.
 *
 * Each entry carries the page's `[id]` (ticket-30 review): a retrieved page is
 * often exactly the one the user then asks to edit, so the id makes it a valid
 * `read_page` / `targetPageId` target no matter how deep it sits — the same
 * id-not-title convention as the workspace outline.
 */
export function formatRetrievedPages(pages: MatchedPage[]): string {
  if (pages.length === 0) return 'No matching pages found in the workspace.'

  const lines: string[] = [
    '[Retrieved from workspace] (the [id] targets a page for read_page or a cross-page edit)',
  ]
  for (const page of pages) {
    const body = blocksToText(page.blocks)
    const title = page.title || 'Untitled'
    lines.push(body ? `- [${page.id}] "${title}": ${body}` : `- [${page.id}] "${title}"`)
  }
  return lines.join('\n')
}
