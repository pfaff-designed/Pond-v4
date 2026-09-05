/**
 * Pure helpers over proposal tool-parts in a chat transcript (ticket-24).
 *
 * The AITerminal derives "is there an unresolved proposal on screen?" to drive
 * the drawer's auto-grow. That derivation lives here, pure and jest-testable,
 * and is also the single home of the "what's this change's status?" expression
 * so the transcript renderer and the derivation can't drift apart.
 */

/** The minimal structural shape of a message part this module inspects. */
export interface ProposalPartLike {
  type: string
  toolCallId?: string
  state?: string
  input?: { changes?: unknown[] }
}

export interface ProposalMessageLike {
  id: string
  parts: ProposalPartLike[]
}

export const PROPOSE_CHANGES_TYPE = 'tool-propose_changes'
export const CREATE_PAGE_TYPE = 'tool-create_page'
export const DEFINE_SCHEMA_TYPE = 'tool-define_schema'
export const ADD_ROW_TYPE = 'tool-add_row'
export const PROMOTE_TABLE_TYPE = 'tool-promote_table'
export const CONFIGURE_VIEW_TYPE = 'tool-configure_view'

/** A single change's decision inside a propose_changes batch ('pending' when undecided). */
export function changeStatus<T extends string>(
  decisions: Record<string, T>,
  toolCallId: string,
  index: number
): T | 'pending' {
  return decisions[`${toolCallId}:${index}`] ?? 'pending'
}

/**
 * The toolCallIds of proposal cards that still need a user decision.
 *
 * `excludeMessageIds` scopes the result to proposals that arrived *in this
 * session*: pending decisions are never persisted in the transcript envelope
 * (ticket-19), so cards re-seeded from a prior session's transcript would
 * otherwise read as unresolved forever — pinning the drawer open on every
 * mount. Callers pass the message ids present at conversation load.
 */
export function unresolvedProposalIds(
  messages: ProposalMessageLike[],
  changeDecisions: Record<string, string>,
  createDecisions: Record<string, string>,
  excludeMessageIds: ReadonlySet<string> = new Set(),
  schemaDecisions: Record<string, string> = {},
  rowDecisions: Record<string, string> = {},
  viewDecisions: Record<string, string> = {},
  promotionDecisions: Record<string, string> = {}
): string[] {
  const ids: string[] = []
  for (const message of messages) {
    if (excludeMessageIds.has(message.id)) continue
    for (const part of message.parts) {
      // Streaming parts have partially-parsed input; they don't count until complete.
      if (!part.toolCallId || part.state === 'input-streaming') continue
      if (part.type === PROPOSE_CHANGES_TYPE) {
        const count = part.input?.changes?.length ?? 0
        for (let i = 0; i < count; i++) {
          if (changeStatus(changeDecisions, part.toolCallId, i) === 'pending') {
            ids.push(part.toolCallId)
            break
          }
        }
      } else if (part.type === CREATE_PAGE_TYPE) {
        if ((createDecisions[part.toolCallId] ?? 'pending') === 'pending') {
          ids.push(part.toolCallId)
        }
      } else if (part.type === DEFINE_SCHEMA_TYPE) {
        if ((schemaDecisions[part.toolCallId] ?? 'pending') === 'pending') {
          ids.push(part.toolCallId)
        }
      } else if (part.type === ADD_ROW_TYPE) {
        if ((rowDecisions[part.toolCallId] ?? 'pending') === 'pending') {
          ids.push(part.toolCallId)
        }
      } else if (part.type === PROMOTE_TABLE_TYPE) {
        if ((promotionDecisions[part.toolCallId] ?? 'pending') === 'pending') {
          ids.push(part.toolCallId)
        }
      } else if (part.type === CONFIGURE_VIEW_TYPE) {
        if ((viewDecisions[part.toolCallId] ?? 'pending') === 'pending') {
          ids.push(part.toolCallId)
        }
      }
    }
  }
  return ids
}
