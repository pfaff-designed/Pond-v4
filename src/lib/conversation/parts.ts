/**
 * Model-emitted correspondence parts (ticket-39, THE SPINE):
 *   - FOLLOW-UP CHIPS (§3) — up to 3-4 quiet suggestions below a reply; clicking
 *     one sends its text. Answers to Pond's own question, or next moves ("turn
 *     this into the plan", "add a phase for glazing").
 *   - QUESTION CARDS (§2) — a branch-pause: when build-out hits a decision that
 *     is the USER's, Pond emits a question + 2-4 option chips + a free answer.
 *     It blocks only its own branch; Pond keeps scaffolding the rest and applies
 *     the answered branch when the user picks. Unanswered questions persist and
 *     mirror into the Brief's open-questions on dissolve.
 *
 * Both are surfaced to the model as client-resolved tools (no `execute`) exactly
 * like create_page / propose_changes — the tool CALL renders the card/chips in
 * the terminal, and the user's pick rides the {messages, resolutions} envelope.
 * This module is the PURE contract: the tool INPUT schemas (so tools.ts and the
 * eval share one definition), the resolution record + its parse/round-trip, and
 * the tiny helpers the terminal renders from. No React, no SDK — jest-pinnable.
 *
 * The option chips of a question card reuse the SAME chip shape as follow-up
 * suggestions (spec §3: "Question-card options reuse the same chip molecule"),
 * so a chip is one string everywhere.
 */

import { z } from 'zod'

// ── Chip shape (shared by suggestions + question options) ────────────────────

/**
 * A single quiet chip: the label the user sees AND the text sent on click are
 * the same string (a chip is an answer/next-move phrased as the user would say
 * it). Kept as a bare string so the render molecule is trivially shared.
 */
export const chipSchema = z.string().min(1).max(80)

/** Up to four chips — more than that stops reading as "quiet". */
const chipsSchema = z.array(chipSchema).min(1).max(4)

// ── suggest_followups tool input (chips) ─────────────────────────────────────

/**
 * The model's follow-up suggestions for the turn it just finished. Emitted as a
 * lightweight client tool so the chips render below the reply; each is a short
 * phrase the user can click to send. Essential in grill/wayfinding (they carry
 * the conversation forward) but allowed in any mode.
 */
export const suggestFollowupsSchema = z.object({
  suggestions: chipsSchema.describe(
    'Up to four short follow-up chips (each ≤ ~8 words) the user can click to send: answers to your own question, or next moves like "turn this into the plan" or "add a phase for glazing". Phrase each as the USER would say it.'
  ),
})
export type SuggestFollowups = z.infer<typeof suggestFollowupsSchema>

// ── ask_question tool input (branch-pause question card) ─────────────────────

/**
 * A branch-pause question card. Pond emits this in BUILD-OUT when it reaches a
 * decision that is the user's to make (spec §2). It blocks ONLY its own branch:
 * Pond continues scaffolding the rest of the structure and applies the answered
 * branch when the user picks.
 *
 *   - `question`  — the decision, phrased plainly.
 *   - `options`   — 2-4 option chips (reuse the shared chip shape); the user can
 *                   click one OR type a free answer.
 *   - `branch`    — a short label naming the branch this gates (e.g. "kiln type"),
 *                   shown on the card + mirrored into the Brief's open-questions
 *                   if it dissolves unanswered.
 */
export const askQuestionSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe('The decision that is the user\'s to make, phrased plainly and briefly.'),
  options: z
    .array(chipSchema)
    .min(2)
    .max(4)
    .describe('2-4 option chips the user can pick from; they may also type a free answer.'),
  branch: z
    .string()
    .min(1)
    .describe(
      'A short label naming the branch this question gates (e.g. "kiln type", "budget tier") — shown on the card and mirrored into the Brief\'s open questions if left unanswered.'
    ),
})
export type AskQuestion = z.infer<typeof askQuestionSchema>

// ── Question resolution (rides the transcript envelope) ──────────────────────

/**
 * A resolved question card: which answer the user gave, whether by clicking an
 * option chip or typing free text. Persisted per toolCallId in the resolutions
 * envelope so the card renders inert (answered) after reload, and so the answer
 * can be sent to the model / mirrored to the Brief.
 */
export interface QuestionResolution {
  /** The answer text (an option chip's label, or the user's free answer). */
  answer: string
  /** How the answer arrived — audit/analytics, and lets the card show "you
   *  picked" vs "you answered". */
  via: 'option' | 'free'
}

/** The question-card decisions for a conversation, keyed by toolCallId — one
 *  entry per answered card. Absent id = still open (blocks only its branch). */
export type QuestionResolutions = Record<string, QuestionResolution>

/**
 * Tolerant parse of persisted question resolutions — never throws, drops
 * anything malformed (matches resolutions.ts's posture so a bad row degrades to
 * "unanswered"). Exported so the resolutions envelope can fold it in.
 */
export function parseQuestionResolutions(value: unknown): QuestionResolutions {
  if (typeof value !== 'object' || value === null) return {}
  const out: QuestionResolutions = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    if (typeof r.answer !== 'string' || !r.answer) continue
    const via = r.via === 'option' || r.via === 'free' ? r.via : 'free'
    out[key] = { answer: r.answer, via }
  }
  return out
}

// ── Render-side helpers (pure) ───────────────────────────────────────────────

/** The minimal structural shape of an ask_question part the terminal renders. */
export interface QuestionPartLike {
  type: string
  toolCallId?: string
  state?: string
  input?: { question?: string; options?: unknown[]; branch?: string }
}

export const ASK_QUESTION_TYPE = 'tool-ask_question'
export const SUGGEST_FOLLOWUPS_TYPE = 'tool-suggest_followups'

/** True when an ask_question part is complete enough to render (input parsed). */
export function isRenderableQuestion(part: QuestionPartLike): boolean {
  return (
    part.type === ASK_QUESTION_TYPE &&
    part.state !== 'input-streaming' &&
    typeof part.input?.question === 'string' &&
    Array.isArray(part.input?.options)
  )
}

/**
 * The toolCallIds of question cards still awaiting an answer (open branches).
 * `answered` is the question-resolutions map. Mirrors unresolvedProposalIds so
 * the terminal can drive the same auto-grow + "there's an open decision" signal.
 * `excludeMessageIds` scopes to THIS session (prior-session open cards would
 * otherwise read as forever-open, exactly like ticket-24's pending proposals).
 */
export function openQuestionIds(
  messages: { id: string; parts: QuestionPartLike[] }[],
  answered: QuestionResolutions,
  excludeMessageIds: ReadonlySet<string> = new Set()
): string[] {
  const ids: string[] = []
  for (const message of messages) {
    if (excludeMessageIds.has(message.id)) continue
    for (const part of message.parts) {
      if (!part.toolCallId || !isRenderableQuestion(part)) continue
      if (!answered[part.toolCallId]) ids.push(part.toolCallId)
    }
  }
  return ids
}

/**
 * The Brief open-questions lines for every UNANSWERED question card in the
 * transcript (spec §2: "mirror into the Brief's open-questions on dissolve").
 * One line per open branch, phrased for the append-only Brief log. Pure so the
 * dissolve path (handoff / clear) can lift them without touching React.
 */
export function briefOpenQuestions(
  messages: { id: string; parts: QuestionPartLike[] }[],
  answered: QuestionResolutions
): string[] {
  const lines: string[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (!part.toolCallId || !isRenderableQuestion(part)) continue
      if (answered[part.toolCallId]) continue
      const q = part.input?.question?.trim()
      const branch = part.input?.branch?.trim()
      if (!q) continue
      lines.push(branch ? `${branch}: ${q}` : q)
    }
  }
  return lines
}
