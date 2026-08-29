/**
 * Multi-step reliability — step budget by lifecycle mode (ticket-39 §4).
 *
 * `streamText`'s `stopWhen: stepCountIs(N)` caps how many model↔tool round-trips
 * a single turn may take. The incumbent flat cap of 8 was tuned for chat +
 * read-then-answer web search (ticket-29), but a BUILD-OUT turn is different: the
 * spec asks Pond to work "step by step … as separate tool batches with stage text
 * between", which means several propose_changes / ask_question / create_page
 * calls in one turn, each read and continued. Eight steps starves that.
 *
 * So the budget is now a function of the lifecycle phase, documented here:
 *
 *   | phase        | budget | why                                                  |
 *   |--------------|:------:|------------------------------------------------------|
 *   | idle (chat)  |   8    | the incumbent: chat + read-then-answer + ≤N searches |
 *   | grill        |   8    | conversational — questions, at most a fetch/search   |
 *   | wayfinding   |  10    | co-drafting the plan may read pages + one Brief edit  |
 *   | build-out    |  16    | the scaffolding turn: parent + Brief + several child  |
 *   |              |        | pages / rollups as SEPARATE batches, with questions   |
 *
 * The numbers are deliberately modest (not "wildly high"): build-out doubles the
 * chat cap, which comfortably covers "state a step list, then land 4-6 batches
 * with stage text between" without letting a runaway loop burn tokens. If a real
 * build-out routinely hits the ceiling we raise it with evidence, not a guess.
 *
 * Pure + dependency-free so the mapping is jest-pinned and the route just reads it.
 */

import type { LifecyclePhase } from '@/lib/conversation/lifecycle'

/** The incumbent flat cap (ticket-29), kept as the chat/idle default. */
export const CHAT_STEP_BUDGET = 8

const BUDGET: Record<LifecyclePhase, number> = {
  idle: CHAT_STEP_BUDGET,
  grill: CHAT_STEP_BUDGET,
  wayfinding: 10,
  'build-out': 16,
}

/**
 * The step budget for a turn, given the lifecycle phase it runs in. A build-out
 * turn gets the most head-room because it lands the structure as several
 * separate tool batches; chat/grill keep the incumbent cap.
 */
export function stepBudgetForPhase(phase: LifecyclePhase): number {
  return BUDGET[phase]
}
