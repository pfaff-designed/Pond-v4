/**
 * The project lifecycle (ticket-39, THE SPINE).
 *
 * Pond becomes a thinking partner with a project arc: an ordinary chat can
 * enter a lifecycle — GRILL → WAYFINDING → BUILD-OUT — when the user brings a
 * NEW-project-shaped ask. This module is the PURE, server-safe core of that
 * arc: intent detection, the phase state machine, the transition signals, the
 * quiet phase word for the context bar, and the persist/parse round-trip for
 * the transcript envelope. No React, no SDK, no I/O — so the whole thing is
 * jest-pinnable with literals.
 *
 * What this module deliberately does NOT do: the adaptive-grill REASONING (how
 * many questions, whether to state "this feels small") lives in the system
 * prompt — the model does it (ticket-06 law: think together, user calls the
 * shot, orient then wait). This module only tracks WHICH phase we're in, moves
 * between phases on explicit user signals, and hands the prompt + UI the facts
 * they need. The model is never forced down the arc: an explicit escape hatch
 * ("just build it") jumps straight to build-out, and the user can always
 * override the phase by saying so.
 *
 * Why a phase field and not free inference every turn: the phase must survive a
 * reload mid-project (spec §2 "returning mid-lifecycle resumes the phase") and
 * must drive a stable context-bar word, so it is a small persisted fact in the
 * {messages, resolutions} envelope, re-seeded on load exactly like card
 * decisions (ticket-19).
 */

/**
 * The phases of the arc. `idle` is ordinary chat — no project in flight. The
 * three working phases are the spec's arc; a project that has been fully
 * scaffolded returns to `idle` (the arc is done; further edits are ordinary
 * propose_changes, not a new lifecycle).
 */
export type LifecyclePhase = 'idle' | 'grill' | 'wayfinding' | 'build-out'

/** The three working phases, in order — for exhaustiveness + ordering checks. */
export const WORKING_PHASES: readonly LifecyclePhase[] = ['grill', 'wayfinding', 'build-out']

/**
 * Read of the project's stakes, set when the lifecycle begins (spec §2: "big/
 * vague → keep going; small/clear → 2-3 sharp questions"). The model STATES this
 * read to the user so they can override; we record it so the phase word and the
 * prompt can reflect it. `undefined` until the grill begins.
 */
export type ProjectStakes = 'small' | 'big'

/**
 * The persisted lifecycle fact. Rides the {messages, resolutions} envelope as a
 * small `lifecycle` field (parseLifecycle tolerates its absence — legacy rows
 * and ordinary-chat rows simply have no lifecycle). Kept intentionally tiny:
 * everything richer (the actual questions, the structure plan) lives in the
 * Brief sub-page and the transcript, not here.
 */
export interface LifecycleState {
  phase: LifecyclePhase
  /** The project's working name, once the user has named it. Drives the
   *  context bar ("Context: Kiln Studio · charting") and the Brief page. */
  projectName?: string
  /** The stakes read the model stated at grill start, so the UI + prompt echo
   *  the same posture the user was told. */
  stakes?: ProjectStakes
}

/** The resting state: ordinary chat, no project in flight. */
export function idleLifecycle(): LifecycleState {
  return { phase: 'idle' }
}

// ── Intent detection ─────────────────────────────────────────────────────────

/**
 * The outcome of reading a user message for lifecycle intent.
 *
 *   - `none`        — ordinary chat / musing; do NOT enter the lifecycle. This
 *                     is the SAFE default and the eval's steward cases pin it
 *                     ("maybe I should make a page someday" is NOT a request).
 *   - `enter-grill` — a NEW-project-shaped ask; the arc begins at GRILL.
 *   - `escape-hatch`— an explicit "just build it" — skip grilling +
 *                     wayfinding, jump straight to BUILD-OUT (spec §2).
 */
export type LifecycleIntent = 'none' | 'enter-grill' | 'escape-hatch'

/**
 * An explicit "skip the questions, just make it" — the escape hatch (spec §2).
 * Deliberately narrow: only phrasings that clearly ask to bypass the
 * think-together arc, so ordinary "make me a page" (which routes to create_page,
 * NOT the lifecycle) is untouched. Checked BEFORE project-shape so
 * "just build the whole thing" jumps to build-out rather than starting a grill.
 */
const ESCAPE_HATCH = [
  /\bjust (build|make|create|do|scaffold|set ?up) it\b/i,
  /\bskip (the )?(questions|grill|grilling|planning|the plan)\b/i,
  /\bno (questions|grilling)\b.*\bjust\b/i,
  /\bdon'?t (grill|ask|question) me\b/i,
  /\bjust get (it|this) (started|going|built|done)\b/i,
]

/**
 * A NEW-project-shaped ask — something with legs the user wants to think
 * through and build, not a one-shot page. These are verbs of planning /
 * figuring-out / undertaking, plus explicit "start a project". Tuned to be
 * CONSERVATIVE: it must not fire on musing ("maybe someday…"), on a plain
 * content-page request ("make me a recipe page" → create_page), or on an edit
 * ("add a checklist"). Those all stay out of the lifecycle so the ticket-16
 * gate and the routing eval are untouched. The grill+wayfinding phases only
 * begin when the user signals they want to WORK THROUGH a project.
 */
const PROJECT_SHAPE = [
  /\b(start|begin|kick ?off|spin ?up) (a |an |my |this )?(new )?project\b/i,
  /\b(turn|make) (this|it|that) (in)?to a project\b/i,
  /\bhelp me (plan|think through|figure out|map out|work out|scope|organi[sz]e) (a |an |my |this |out )?/i,
  /\bi(?:'m| am)? (planning|thinking about|want) (to )?(plan|build|start|launch|organi[sz]e|tackle|take on)\b/i,
  /\b(let'?s|lets|can we|could we|help me) (plan|figure out|think through|map out|scope|work through)\b/i,
  /\bplan (out )?(a |an |my |this )/i,
  /\bwork through (a |an |my |this )/i,
]

/** Musing tells — a passing "maybe someday" mention is never a request even if
 *  it mentions a project (matches the eval's steward-persona guard). If the
 *  message is clearly tentative, we never enter the lifecycle. */
const MUSING = [
  /\b(maybe|might|someday|one day|not sure|thinking out loud|just musing|eventually|at some point)\b/i,
]

/**
 * Read a user message for lifecycle intent. Pure + deterministic so the intent
 * matrix is jest-pinned. Order: escape hatch (explicit bypass) → musing guard
 * (never enter on a tentative mention) → project shape → else none.
 */
export function detectLifecycleIntent(text: string): LifecycleIntent {
  const t = text.trim()
  if (!t) return 'none'
  if (ESCAPE_HATCH.some((re) => re.test(t))) return 'escape-hatch'
  // A tentative musing that merely MENTIONS planning is not an entry. The
  // escape hatch above is exempt (it's an explicit imperative, never musing).
  const musing = MUSING.some((re) => re.test(t))
  if (musing) return 'none'
  if (PROJECT_SHAPE.some((re) => re.test(t))) return 'enter-grill'
  return 'none'
}

// ── Phase transitions ────────────────────────────────────────────────────────

/**
 * A transition signal derived from a user message DURING a lifecycle. The user
 * calls the shot (ticket-06): Pond never advances the phase on its own reading —
 * it advances when the user says to move.
 *
 *   - `advance`  — "turn this into the plan" / "looks good, build it" — move to
 *                  the next phase (grill → wayfinding → build-out).
 *   - `escape`   — the escape hatch mid-grill/mid-wayfinding: jump to build-out.
 *   - `abandon`  — "never mind" / "drop it" — leave the lifecycle back to idle.
 *   - `stay`     — anything else: keep answering within the current phase.
 */
export type LifecycleSignal = 'advance' | 'escape' | 'abandon' | 'stay'

const ADVANCE = [
  /\b(turn|make) (this|it|that) (in)?to (the |a )?(plan|structure|route|wayfinding)\b/i,
  /\b(let'?s|lets|okay|ok|yes|yeah|sounds good|looks good|that works|perfect|great)\b.*\b(plan|build|scaffold|set ?up|make it|do it|go)\b/i,
  /\b(build|scaffold|set ?up|create|make) (it|this|that|the (project|structure|pages?))\b/i,
  /\b(ready|let'?s go|go ahead|proceed|move on|next)\b/i,
  /\bthat'?s the plan\b/i,
]

const ABANDON = [
  /\b(never ?mind|forget it|drop it|cancel|stop|not now|leave it)\b/i,
]

/**
 * The signal a user message carries within an active lifecycle. `escape` reuses
 * the escape-hatch matcher so "just build it" mid-grill jumps to build-out.
 * Pure; jest-pinned. In `idle` there is no phase to move, so callers should not
 * ask — but if they do, only `abandon` is meaningful (no-op) and everything is
 * `stay`.
 */
export function detectLifecycleSignal(text: string, phase: LifecyclePhase): LifecycleSignal {
  const t = text.trim()
  if (!t || phase === 'idle') return 'stay'
  if (ABANDON.some((re) => re.test(t))) return 'abandon'
  if (ESCAPE_HATCH.some((re) => re.test(t))) return 'escape'
  if (ADVANCE.some((re) => re.test(t))) return 'advance'
  return 'stay'
}

/** The phase after this one in the arc (grill → wayfinding → build-out); a
 *  build-out that advances is DONE and returns to idle. */
function nextPhase(phase: LifecyclePhase): LifecyclePhase {
  switch (phase) {
    case 'grill':
      return 'wayfinding'
    case 'wayfinding':
      return 'build-out'
    case 'build-out':
      return 'idle' // the arc is complete; ordinary chat resumes
    case 'idle':
      return 'idle'
  }
}

/**
 * Apply a signal to the lifecycle state. Pure — returns a NEW state, never
 * mutates. The single home of "what does this signal do to the phase", so the
 * route, the terminal, and the tests can't drift.
 *
 *   - `advance`  → next phase in the arc.
 *   - `escape`   → jump to build-out (unless already there / idle).
 *   - `abandon`  → back to idle, project context cleared.
 *   - `stay`     → unchanged.
 */
export function applyLifecycleSignal(
  state: LifecycleState,
  signal: LifecycleSignal
): LifecycleState {
  switch (signal) {
    case 'advance':
      return { ...state, phase: nextPhase(state.phase) }
    case 'escape':
      return state.phase === 'idle' || state.phase === 'build-out'
        ? state
        : { ...state, phase: 'build-out' }
    case 'abandon':
      return idleLifecycle()
    case 'stay':
      return state
  }
}

/**
 * Begin a lifecycle from an intent read on a user message. `enter-grill` starts
 * at GRILL; `escape-hatch` starts directly at BUILD-OUT (spec §2). `none`
 * leaves the state untouched (ordinary chat). Pure.
 */
export function beginLifecycle(
  state: LifecycleState,
  intent: LifecycleIntent,
  opts: { projectName?: string; stakes?: ProjectStakes } = {}
): LifecycleState {
  if (intent === 'none') return state
  const base = {
    ...state,
    ...(opts.projectName ? { projectName: opts.projectName } : {}),
    ...(opts.stakes ? { stakes: opts.stakes } : {}),
  }
  return { ...base, phase: intent === 'escape-hatch' ? 'build-out' : 'grill' }
}

// ── Context-bar phase word ───────────────────────────────────────────────────

/**
 * The quiet Press word for the terminal context bar (spec §2 "quiet phase
 * indicator"): grilling → charting → building. Lower-case, calm — a whispered
 * status, never a shouty stage. `idle` has no word (the bar shows just the
 * context label, no phase clause).
 */
const PHASE_WORD: Record<LifecyclePhase, string | null> = {
  idle: null,
  grill: 'grilling',
  wayfinding: 'charting',
  'build-out': 'building',
}

export function lifecyclePhaseWord(state: LifecycleState): string | null {
  return PHASE_WORD[state.phase]
}

/**
 * The full context-bar label for a lifecycle turn: e.g. "Kiln Studio ·
 * charting" when a named project is mid-charting, or just the base label when
 * idle. The terminal passes its base context label (the open page name or
 * "Life"); this appends the quiet phase clause, preferring the project name
 * over the base label while a project is in flight.
 *
 *   idle                        → base
 *   grill, no name              → "base · grilling"
 *   charting, name "Kiln Studio"→ "Kiln Studio · charting"
 */
export function lifecycleContextLabel(state: LifecycleState, baseLabel: string): string {
  const word = lifecyclePhaseWord(state)
  if (!word) return baseLabel
  const subject = state.projectName?.trim() || baseLabel
  return `${subject} · ${word}`
}

// ── Persist / parse round-trip (transcript envelope) ─────────────────────────

/**
 * Tolerant parse of a persisted lifecycle value — never throws, degrades an
 * absent/malformed value to `idle` (so legacy rows and ordinary-chat rows just
 * have no lifecycle). Mirrors resolutions.ts's parse posture exactly.
 */
export function parseLifecycle(value: unknown): LifecycleState {
  if (typeof value !== 'object' || value === null) return idleLifecycle()
  const v = value as Record<string, unknown>
  const phase = v.phase
  const validPhase: LifecyclePhase =
    phase === 'grill' || phase === 'wayfinding' || phase === 'build-out' || phase === 'idle'
      ? phase
      : 'idle'
  const state: LifecycleState = { phase: validPhase }
  if (typeof v.projectName === 'string' && v.projectName.trim()) {
    state.projectName = v.projectName
  }
  if (v.stakes === 'small' || v.stakes === 'big') {
    state.stakes = v.stakes
  }
  return state
}

/** True when a lifecycle is worth persisting/sending — i.e. a project is in
 *  flight. An `idle` state with no project context is the default and need not
 *  ride the envelope (keeps ordinary-chat transcripts clean). */
export function isLifecycleActive(state: LifecycleState): boolean {
  return state.phase !== 'idle'
}
