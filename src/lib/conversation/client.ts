import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { UIMessage } from 'ai'
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
  userId: string
): Promise<ActiveConversation> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, transcript')
    .eq('user_id', userId)
    .is('dissolved_at', null)
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
    .insert({ user_id: userId })
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
    return { messages: transcript as UIMessage[], resolutions: emptyResolutions() }
  }
  if (typeof transcript === 'object' && transcript !== null) {
    const t = transcript as { messages?: unknown; resolutions?: unknown }
    if (Array.isArray(t.messages)) {
      return {
        messages: t.messages as UIMessage[],
        resolutions: parseResolutions(t.resolutions),
      }
    }
  }
  return { messages: [], resolutions: emptyResolutions() }
}
