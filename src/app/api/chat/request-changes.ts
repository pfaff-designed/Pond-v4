/**
 * Request changes on a diff, server side (#98, board 6c frame 3).
 *
 * "A note opens under the card and goes to whoever proposed the diff. They send
 * a revised diff in its place; the first one stays in the change log as changes
 * requested." In M1 the proposer is always Pond, so the note rides the chat
 * request body and this turn's reply is the revised diff. The same path serves
 * `revise` on an outdated card, with the reason telling the model the page
 * moved on so it re-reads before proposing.
 *
 * Pure: the body parse and the context block the route injects. The route owns
 * the record advance and the revision link.
 */

export type RequestChangesReason = 'note' | 'outdated'

export interface RequestChangesBody {
  /** The propose_changes call the note answers. */
  toolCallId: string
  /** What the person typed (or the canned revise line on an outdated card). */
  note: string
  reason: RequestChangesReason
}

/** Tolerant parse — anything malformed is no request at all. */
export function parseRequestChanges(value: unknown): RequestChangesBody | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  if (typeof v.toolCallId !== 'string' || v.toolCallId.length === 0) return undefined
  if (typeof v.note !== 'string' || v.note.trim().length === 0) return undefined
  if (v.reason !== 'note' && v.reason !== 'outdated') return undefined
  return { toolCallId: v.toolCallId, note: v.note.trim(), reason: v.reason }
}

/**
 * The context block that tells the model what this turn is. Deterministic — it
 * fires on the body, not on the model noticing — so a request-changes note is
 * never answered with prose, and an outdated revise never re-emits the stale
 * block ids.
 */
export function requestChangesContextNote(rc: RequestChangesBody): string {
  const lines = [
    `[Request changes] The user's latest message is a note on your propose_changes proposal (tool call ${rc.toolCallId}).`,
  ]
  if (rc.reason === 'outdated') {
    lines.push(
      'That proposal is OUTDATED: its target page was edited after you proposed it, so its block references and before-text no longer match. Read the page as it now stands (it is in context if it is the open page; otherwise read_page it) and propose a REVISED propose_changes batch that carries the same intent onto the current blocks.'
    )
  } else {
    lines.push(
      `Their note: "${rc.note}". Reply with a REVISED propose_changes batch for the SAME page that addresses the note — keep what they did not object to, change what they did. Do not re-propose the original unchanged, do not apply anything yourself, and keep any explanation to one sentence.`
    )
  }
  return lines.join('\n')
}
