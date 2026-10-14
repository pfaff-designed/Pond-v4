import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { inPond, resolvePond } from '@/lib/pond/scope'
import type { UIMessage } from 'ai'
import { firstQuestionFromMessages } from '@/lib/change-log/record-page'
import { emptyResolutions, parseResolutions, type ConversationResolutions } from './resolutions'

export interface ActiveConversation {
  id: string
  messages: UIMessage[]
  /** Proposal-card decisions restored with the transcript (ticket-19). */
  resolutions: ConversationResolutions
}

type ConversationRecord = {
  id: string
  transcript: unknown
}

export async function getOrCreateConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  /**
   * #312: the thread belongs to a pond. `Pond 06.13` `s6m5`: "pages, databases,
   * memory, threads and the change log are per pond. Nothing crosses over."
   *
   * Without this the composer opened the person's most recent thread whatever pond
   * they were in, so a brand-new pond came up holding the last conversation —
   * which also means its context and read chips referred to pages that pond cannot
   * see. Omitted, it falls back to the person's first pond.
   */
  pondId: string | null
): Promise<ActiveConversation> {
  const pond = await resolvePond(supabase, userId, pondId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (supabase as any)
    .from('conversations')
    .select('id, transcript')
    .eq('user_id', userId)
    .is('dissolved_at', null)

  const { data: existing } = await inPond(q, pond)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const record = existing as ConversationRecord | null

  if (record) {
    return {
      id: record.id,
      ...deserializeTranscript(record.transcript),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: created, error } = await sb
    .from('conversations')
    // A new thread is born in the pond it was started from, so it never leaks
    // into another one.
    .insert({ user_id: userId, ...(pond ? { pond_id: pond } : {}) })
    .select('id')
    .single()

  if (error || !created) throw new Error('Failed to create conversation')
  return { id: created.id as string, messages: [], resolutions: emptyResolutions() }
}

export async function saveTranscript(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  messages: UIMessage[],
  resolutions: ConversationResolutions = emptyResolutions()
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('conversations')
    .update({ transcript: { messages, resolutions } })
    .eq('id', conversationId)
}

/** The change log record page's "from thread" chip (KAN-152): the only
 *  existing read path to a conversation's transcript, reused rather than
 *  duplicated — `null` when the thread is gone or carries no question yet. */
export async function getThreadFirstQuestion(
  supabase: SupabaseClient<Database>,
  threadId: string
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('conversations')
    .select('transcript')
    .eq('id', threadId)
    .maybeSingle()
  if (!data) return null
  const { messages } = deserializeTranscript(data.transcript)
  return firstQuestionFromMessages(messages)
}

export async function dissolveConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('conversations')
    .update({ dissolved_at: new Date().toISOString() })
    .eq('id', conversationId)
}

// UIMessage in AI SDK v7 is fully JSON-serializable — no Date fields.
// The transcript column is an envelope `{ messages, resolutions }` so card
// decisions survive reload (ticket-19); legacy rows hold a bare UIMessage[].
function deserializeTranscript(transcript: unknown): {
  messages: UIMessage[]
  resolutions: ConversationResolutions
} {
  if (Array.isArray(transcript)) {
    return {
      messages: normalizeDuplicateMessageIds(transcript as UIMessage[]),
      resolutions: emptyResolutions(),
    }
  }
  if (typeof transcript === 'object' && transcript !== null) {
    const t = transcript as { messages?: unknown; resolutions?: unknown }
    if (Array.isArray(t.messages)) {
      return {
        messages: normalizeDuplicateMessageIds(t.messages as UIMessage[]),
        resolutions: parseResolutions(t.resolutions),
      }
    }
  }
  return { messages: [], resolutions: emptyResolutions() }
}

/**
 * The first occurrence of a repeated id keeps it; only later repeats are
 * renamed. Renaming is deterministic (derived from array position) and
 * idempotent — re-running this on an already-normalized transcript is a
 * no-op.
 */
function normalizeDuplicateMessageIds(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>()
  return messages.map((message) => {
    if (!seen.has(message.id)) {
      seen.add(message.id)
      return message
    }
    let occurrence = 1
    let id = `${message.id}-dup${occurrence}`
    while (seen.has(id)) {
      occurrence += 1
      id = `${message.id}-dup${occurrence}`
    }
    seen.add(id)
    return { ...message, id }
  })
}
