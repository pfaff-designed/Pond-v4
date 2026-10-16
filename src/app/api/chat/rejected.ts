/**
 * No-retry context, server side (6c frame 5, KAN-132).
 *
 * "Pond does not propose the same edit again unless asked." The route finds
 * which proposal tool calls are still present in the incoming thread, looks up
 * their change-log records, keeps the ones a person rejected, and turns those
 * into a short `[Rejected]` note the model reads before it routes. `handleAskAgain`
 * drops the rejected card's message from history before resending, so once a
 * person asks again the tool call is no longer in `messages` and this module
 * naturally stops naming it — no extra flag needed.
 *
 * Pure: finding the ids and building the note. The route owns the change-log
 * lookup and the target-page title resolution.
 */
import {
  PROPOSE_CHANGES_TYPE,
  DEFINE_SCHEMA_TYPE,
  ADD_ROW_TYPE,
  PROMOTE_TABLE_TYPE,
  CONFIGURE_VIEW_TYPE,
  LINK_RECORDS_TYPE,
  type ProposalMessageLike,
} from '@/lib/conversation/proposals'

const REJECTABLE_TYPES = new Set<string>([
  PROPOSE_CHANGES_TYPE,
  DEFINE_SCHEMA_TYPE,
  ADD_ROW_TYPE,
  PROMOTE_TABLE_TYPE,
  CONFIGURE_VIEW_TYPE,
  LINK_RECORDS_TYPE,
])

/** The tool-call ids of every proposal part still present in `messages` — the
 *  set a rejection can still apply to. `create_page` is excluded: a reject on a
 *  brand-new page is not "the same edit" in 6c f5's sense. */
export function proposalToolCallIds(messages: ProposalMessageLike[]): string[] {
  const ids: string[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (!part.toolCallId || !REJECTABLE_TYPES.has(part.type)) continue
      ids.push(part.toolCallId)
    }
  }
  return ids
}

export interface RejectedEntry {
  /** The target page's title, as a person would read it. */
  targetTitle: string
  /** One line on what the rejected edit was. */
  summary: string
}

/**
 * The `[Rejected]` context block, or null when there is nothing to say.
 * One line per entry so the model can match a new request against each by
 * eye, the same shape `[Scoping]` and `[Request changes]` already use.
 */
export function rejectedContextNote(entries: RejectedEntry[]): string | null {
  if (entries.length === 0) return null
  const lines = [
    "[Rejected] The user has already rejected these edits in this thread. Do not propose any of them again unless the user asks again (their own words, or the \"ask again\" chip):",
    ...entries.map((entry) => `- ${entry.targetTitle}: ${entry.summary}`),
  ]
  return lines.join('\n')
}
