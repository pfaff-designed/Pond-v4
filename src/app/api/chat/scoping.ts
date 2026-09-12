/**
 * Grill-before-build gate (supersedes part of #59).
 *
 * #59 shipped "named subject → BUILD NOW": a request that carried its subject
 * ("an inventory page for my workshop tools", "a grocery list") sailed straight
 * into create_page with INVENTED defaults. The user's product intent is the
 * opposite — Pond is a thinking partner, so before it builds anything it should
 * interrogate intent (goals, preferences, constraints) the way /grill-me does,
 * THEN build. This module now fires on ANY from-scratch creation, not just the
 * bare shape, and the note it injects tells the model to grill first.
 *
 * This is the DETERMINISTIC floor under the prompt's SCOPING section: a pure,
 * text-only detector for "the latest message is a creation/build request" plus
 * the [Scoping] note the route injects when it fires. The prompt teaches the
 * same behaviour for paraphrases the heuristic can't see; the note is the hard
 * floor for the shapes it can. The #1 correctness risk is OVER-firing on EDITS
 * (spec §4.2): "add a checklist", "reword the intro", "track my reading list",
 * "show my tasks as a board", "promote this table" all EDIT existing content and
 * must stay contextual — never grilled. So the detector vetoes edit-intent and
 * musing BEFORE it looks for creation-intent, and only fires when a creation
 * verb mints a creatable artifact. Pure + regex-only so the matrix is jest-pinned
 * (scoping-gate.test.ts). The escape hatch ("just build it") is always exempt.
 */
import { detectLifecycleIntent } from '@/lib/conversation/lifecycle'

// Leading filler that can precede the real verb without changing intent.
const FILLER =
  "(?:hey|hi|ok|okay|so|well|actually|please|pond|can you|could you|would you|will you|i want you to|i'?d like you to|go ahead and|let'?s|lets|for me|now)"
const START = `^(?:${FILLER}[,!.\\s]+)*`

// Creation verbs that MINT a new artifact. Deliberately excludes need/want
// (handled separately — too weak to lead) and every edit verb.
const CREATE_VERBS =
  '(?:create|make|build|start|begin|spin ?up|set ?up|setup|put together|come up with|draft|generate|whip up|throw together|cook up|turn|convert)'

// Creatable page-level artifacts. Multiword / longer alternatives first so the
// regex doesn't stop short (e.g. "cheat sheet" before "sheet").
const NOUN =
  '(?:cheat ?sheets?|reading lists?|grocery lists?|to-?do lists?|pages?|projects?|trackers?|logs?|inventor(?:y|ies)|routines?|dashboards?|boards?|collections?|databases?|db|tables?|lists?|notes?|docs?|documents?|plans?|workspaces?|areas?|sheets?|schedules?|matri(?:x|ces)|comparisons?|grids?|journals?|budgets?|roadmaps?|wikis?|catalog(?:ue)?s?|calendars?|rosters?|itiner(?:ary|aries)|menus?)'

/** Edit verbs that, when they LEAD the message, mark it as a change to existing
 *  content (propose_changes / define_schema-on-existing / add_row / configure_view
 *  / link_records / promote_table) — never a from-scratch build. */
const EDIT_LEAD = new RegExp(
  `${START}(?:add|reword|rewrite|change|edit|update|revise|adjust|tweak|bump|mark|move|rename|remove|delete|append|link|connect|associate|show|display|view|format|sort|filter|group|promote|track|log|keep|record)\\b`,
  'i'
)

/** A promote_table-shaped request: converting an EXISTING 'table' block carries
 *  its rows across — there is nothing to grill. Vetoes "turn/make/convert THIS
 *  table into a …" (which otherwise looks like structural creation). */
const EXISTING_TABLE = /\b(?:this|that|the)\s+table\b/i

/** Tentative musing — a passing "maybe someday" is never a build request even if
 *  it names an artifact ("maybe I should make a page for my jigs someday"). */
const MUSING =
  /\b(?:maybe|might|someday|one day|not sure|thinking out loud|just musing|eventually|at some point|been meaning to)\b/i

/** Creation-intent: a creation verb minting a creatable artifact, anchored at
 *  the start (modulo filler) so a mid-sentence noun in an edit can't trip it. */
const CREATE_ARTIFACT = new RegExp(
  `${START}${CREATE_VERBS}\\b(?:\\s+(?:me|us))?\\s+(?:(?:a|an|some|another|the|my|our)\\s+)?(?:[\\w-]+\\s+){0,4}?${NOUN}\\b`,
  'i'
)

/** The user's motivating shape: "I need a grocery list" / "I want a workout
 *  routine". Restricted to need/want + article + a nearby noun so "I need to
 *  update the reading list" (an edit) does NOT match. */
const NEED_ARTIFACT = new RegExp(
  `${START}(?:i\\s+)?(?:need|want|'?d like|would like)\\s+(?:me\\s+)?(?:a|an|some|another)\\s+(?:[\\w-]+\\s+){0,3}?${NOUN}\\b`,
  'i'
)

/**
 * True when the latest user message asks Pond to CREATE / BUILD new content
 * from scratch — the case where acting immediately means inventing intent the
 * user never gave. Order matters: the escape hatch and musing are exempt, edits
 * are vetoed, and only then does creation-intent fire. Converting an existing
 * table (promote_table) is an edit and never grills.
 */
export function needsScoping(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  // Explicit bypass — an escape hatch must never draw questions.
  if (detectLifecycleIntent(t) === 'escape-hatch') return false
  // A tentative mention is not a request.
  if (MUSING.test(t)) return false
  // Editing existing content stays contextual (spec §2.1).
  if (EDIT_LEAD.test(t)) return false
  if (EXISTING_TABLE.test(t)) return false
  // From-scratch creation → grill first.
  return CREATE_ARTIFACT.test(t) || NEED_ARTIFACT.test(t)
}

/**
 * The [Scoping] context note injected when the gate fires — the adaptive-grill
 * instruction, phrased to match the prompt's SCOPING section so the
 * deterministic floor and the taught behaviour say the same thing. It forbids
 * building this turn, forbids inventing contents, preserves the don't-re-ask
 * rule, reads the stakes, and keeps the one-pass build + escape hatch.
 */
export const SCOPING_NOTE = `[Scoping] The user's latest message asks you to CREATE or BUILD something new. Before you build, grill their intent the way a sharp collaborator would: ask the questions only THEY can answer — goals, motivation, preferences, constraints, scope (a grocery list: which meals, how many people, dietary limits, which store; a workout routine: goal, experience, days per week, equipment, injuries). Do NOT call any creation tool this turn, and do NOT invent a topic, title, columns, or contents the user did not give. Do NOT re-ask anything they already specified — scope only the remaining gaps and the intent behind them. Even a small, trivial-seeming, or fully-specified ask earns ONE quick intent question first — but keep it to a SINGLE round, then build on their very next reply. Only a genuinely big or vague project earns more than one round. Once they answer, build the whole agreed structure in one continuous pass. If they say "just build it", build immediately with sensible defaults.`

/** The note for a turn, or null when the gate stays quiet. Mirrors
 *  `lifecycleContextNote`'s shape so the route wires both the same way. */
export function scopingContextNote(text: string): string | null {
  return needsScoping(text) ? SCOPING_NOTE : null
}
