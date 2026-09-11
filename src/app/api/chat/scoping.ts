/**
 * Scope-before-build gate (#59).
 *
 * A bare "create a project" used to sail straight through the STEWARD gate
 * ("the request IS the confirmation") into create_page — and the model, having
 * no subject to build, INVENTED one and started filling it in blind. Issue #59's
 * contract: always scope, then build. A creation request that names no subject
 * draws a short round of scoping questions and creates NOTHING yet; once the
 * user answers (or when the request carried its subject all along) the whole
 * structure lands in one continuous pass.
 *
 * This module is the DETERMINISTIC half of that contract: a pure detector for
 * the bare-request shape ("create a project", "make me a page", "set up a
 * tracker") plus the [Scoping] context note the route injects when it fires.
 * The prompt's SCOPING section teaches the same behaviour for paraphrases this
 * heuristic can't see; the note is the hard floor under it for the exact shape
 * the bug report showed. Deliberately CONSERVATIVE: it must never fire on a
 * request that carries its subject ("create a project called Website Redesign",
 * "make me a recipe page for lasagna" — both eval-pinned to build immediately),
 * on an edit, or on the escape hatch ("just build it"). Pure + regex-only so
 * the matrix is jest-pinned (scoping-gate.test.ts).
 */
import { detectLifecycleIntent } from '@/lib/conversation/lifecycle'

// Creation verbs that can open a bare structural request.
const VERBS = '(?:create|make|build|start|begin|spin ?up|set ?up|setup)'
// Generic artifact nouns — a request that ENDS on one of these (modulo filler)
// names no subject. Longer alternatives first so the regex doesn't stop short.
const NOUNS =
  '(?:projects?|pages?|tables?|databases?|db|trackers?|collections?|areas?|routines?|dashboards?|boards?|documents?|docs?|notes?|lists?|plans?|structures?|workspaces?)'
// Leading filler that can precede the verb without adding a subject.
const PRE = "(?:hey|hi|ok|okay|so|please|pond|can you|could you|would you|will you|i want you to|i'd like you to|go ahead and|let'?s|lets)"
// Trailing filler that can follow the noun without adding a subject.
const POST = '(?:for me|please|now|real quick|quickly|here)'

/** The whole message is a creation verb + generic artifact noun and nothing
 *  else — no subject, no title, no contents. */
const BARE_CREATE = new RegExp(
  `^(?:${PRE}[,!.\\s]+)*${VERBS}\\s+(?:(?:me|us)\\s+)?(?:(?:a|an|the|my|some)\\s+)?(?:(?:new|blank|empty)\\s+)?${NOUNS}(?:\\s+${POST})*[\\s.!?]*$`,
  'i'
)

/**
 * True when the latest user message is a BARE structural-creation request —
 * one the model could only fulfil by inventing a subject. The escape hatch
 * ("just build it") is exempt: an explicit bypass must never draw questions.
 */
export function needsScoping(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (detectLifecycleIntent(t) === 'escape-hatch') return false
  return BARE_CREATE.test(t)
}

/**
 * The [Scoping] context note injected when the gate fires — phrased to match
 * the prompt's SCOPING section so the deterministic floor and the taught
 * behaviour say the same thing.
 */
export const SCOPING_NOTE = `[Scoping] The user's latest message asks to create something but names NO subject — there is nothing to build yet. Do NOT call any creation tool this turn, and do NOT invent a topic, title, or contents. Ask a short round of scoping questions instead (two or three at most, in this one reply): what it is for, what it should contain, and where it should live. Once they answer, build the whole agreed structure in one continuous pass.`

/** The note for a turn, or null when the gate stays quiet. Mirrors
 *  `lifecycleContextNote`'s shape so the route wires both the same way. */
export function scopingContextNote(text: string): string | null {
  return needsScoping(text) ? SCOPING_NOTE : null
}
