/**
 * A thread is a list of turns: a question, and everything that came of it — the
 * answer, its cards, and any request-changes notes sent back to it. Pure, so the
 * composer's fold is testable without React.
 */

/** Beyond this many turns the earlier ones fold into `N earlier turns`. */
export const VISIBLE_TURNS = 3

interface TurnMessage {
  role: string
  metadata?: unknown
}

/** A user message that is a note on a diff card belongs to the turn it answers. */
const startsTurn = (message: TurnMessage): boolean =>
  message.role === 'user' &&
  !(message.metadata as { requestChanges?: unknown } | undefined)?.requestChanges

/** Message indices grouped by turn, oldest first. Messages before the first
 *  question (a re-seeded answer) form a turn of their own. */
export const groupTurns = (messages: readonly TurnMessage[]): number[][] => {
  const turns: number[][] = []
  messages.forEach((message, index) => {
    if (turns.length === 0 || startsTurn(message)) turns.push([])
    turns[turns.length - 1].push(index)
  })
  return turns
}

/** How many of the oldest turns fold away: none until the thread outgrows the visible few. */
export const foldedTurnCount = (turnCount: number, visible = VISIBLE_TURNS): number =>
  Math.max(0, turnCount - visible)
