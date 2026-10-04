/**
 * Domain logic for the /handoff command.
 *
 * Unlike /save (which opens a picker for per-item confirmation), /handoff is a
 * dissolve: the Quick model extracts entities from the transcript, writes them
 * ALL, then the current conversation is dissolved and a fresh session begins
 * (build-brief §9).
 *
 * Entity extraction reuses the existing /api/save-extract route.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { UIMessage } from 'ai'
import type { SaveExtraction } from '@/app/api/save-extract/route'
import { createNode as defaultCreateNode } from '@/lib/nodes/create'
import {
  dissolveConversation as defaultDissolveConversation,
  getOrCreateConversation as defaultGetOrCreateConversation,
  type ActiveConversation,
} from '@/lib/conversation/client'

/**
 * Default extractor: POST the transcript to /api/save-extract (Quick model).
 * Returns an empty array on any failure so a handoff never hard-fails on the
 * extraction step — but note performHandoff will still dissolve in that case,
 * matching /clear-like behaviour when there is nothing to save.
 */
export async function extractEntities(messages: UIMessage[]): Promise<SaveExtraction[]> {
  try {
    const res = await fetch('/api/save-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { extractions: SaveExtraction[] }
    return data.extractions ?? []
  } catch {
    return []
  }
}

export interface HandoffDeps {
  extract: (messages: UIMessage[]) => Promise<SaveExtraction[]>
  createNode: typeof defaultCreateNode
  dissolveConversation: typeof defaultDissolveConversation
  getOrCreateConversation: typeof defaultGetOrCreateConversation
}

export interface HandoffResult {
  freshConversation: ActiveConversation
  written: number
}

const defaultDeps: HandoffDeps = {
  extract: extractEntities,
  createNode: defaultCreateNode,
  dissolveConversation: defaultDissolveConversation,
  getOrCreateConversation: defaultGetOrCreateConversation,
}

/**
 * Run the /handoff lifecycle: extract → write all → dissolve → fresh session.
 *
 * Writes happen BEFORE the dissolve. If any write throws, the error propagates
 * and the conversation is left intact so the transcript is not lost.
 */
export async function performHandoff(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
  messages: UIMessage[],
  deps: HandoffDeps = defaultDeps,
  /** #312: the pond the handoff writes into and whose fresh thread it opens. */
  pondId: string | null = null
): Promise<HandoffResult> {
  const extractions = await deps.extract(messages)

  for (const item of extractions) {
    await deps.createNode(supabase, { type: item.type, name: item.name }, pondId)
  }

  await deps.dissolveConversation(supabase, conversationId)
  const freshConversation = await deps.getOrCreateConversation(supabase, userId, pondId)

  return { freshConversation, written: extractions.length }
}
