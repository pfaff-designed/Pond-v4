---
id: 39
label: cycle-3:spine
status: resolved
blocked-by: []
blocks: []
---

# The spine: collaborator personality + project lifecycle (F11 + F19; absorbs F2, mechanisms F3+F9)

The product's soul. User's model: "similar to working here in Code." USER
DECISIONS LOCKED (2026-08-29): adaptive grill · visible Brief page ·
branch-pause question cards · quiet phase indicator.

## 1. Collaborator personality + per-project memory (F11)

- Persona layer in the system prompt: Pond is a thinking partner — opinions,
  trade-offs, gentle pushback, warmth without servility; never replaces the
  user's judgment (t06 law). Voice = the Press register.
- **Project Brief = a visible sub-page** named "Brief" under a project page,
  maintained by Pond via the NORMAL propose/accept machinery (t16 gate — a
  brief update is a proposal like any other; keep them small and batched).
  Contents: goal, motivation, key decisions (append-only log w/ dates), open
  questions. Pond reads the Brief (read_page/outline) whenever working on
  that project; on RETURN to a project after absence: one orienting line
  (t06: orient then wait) — "Last time you decided X; the kiln question is
  still open."
- **Project awareness**: when asked (or on return), Pond reasons about
  completeness — phases without dates, budgets without totals, unchecked
  prerequisites, stale items — grounded in read_page data, never invented.

## 2. The lifecycle: GRILL → WAYFINDING → BUILD-OUT (F19)

Intent detection: a NEW-project-shaped ask enters the lifecycle. Explicit
escape hatch ("just make it") skips to build-out.

- **GRILL (adaptive)**: interrogate goals+motivations. Reads stakes: big/vague
  → keep going until the shape is solid; small/clear → 2-3 sharp questions.
  Pond STATES its read ("this feels small — two questions and we'll move")
  so the user can override ("grill me harder" / "just build it").
- **WAYFINDING**: co-draft the route — phases, milestones, decisions-to-make,
  explicit unknowns ("fog"). Produces/updates the Brief + a structure plan
  the user agrees to before anything is scaffolded. User calls the shot.
- **BUILD-OUT**: scaffold the agreed structure (parent page + Brief + child
  pages, using the full W2 vocabulary: kanban for workflows, rollup metrics
  on the parent via {pages:'children'}, tables w/ sumColumn, charts where
  data exists). Work visibly step-by-step (F9): Pond states a short step list
  in the transcript and executes steps as separate tool batches with stage
  text between. **Branch-pause question cards**: when Pond hits a decision
  that is the user's, it emits a QUESTION CARD (new part type or a
  distinguished card in the transcript: question + 2-4 option chips + free
  answer) that blocks ONLY that branch — Pond continues scaffolding the rest
  and applies the answered branch when the user picks. Unanswered questions
  persist in the transcript (and mirror into the Brief's open-questions on
  dissolve).
- **Quiet phase indicator**: the terminal context bar reads e.g.
  "Context: Kiln Studio · charting" (grilling → charting → building; word
  choice yours, keep it Press-calm). Derived from lifecycle state.
- **Lifecycle state persists** (the {messages,resolutions} envelope gains a
  small lifecycle field or the Brief carries it): returning mid-lifecycle
  resumes the phase.

## 3. Follow-up chips (F3) — the grill's mechanics

After Pond replies (all modes, but essential in grill/wayfinding): up to 3-4
model-suggested follow-up chips below the reply (quiet Press chips, not
shouting buttons) — answers to its own question, next moves ("turn this into
the plan", "add a phase for glazing"). Clicking sends that text. Model emits
them as a lightweight part (e.g. a `suggestions` tool or tagged block in the
reply); render-side molecule + stories. Question-card options reuse the same
chip molecule.

## 4. Multi-step reliability (F9 remainder)

- Raise stepCountIs for lifecycle turns (budget by mode: build-out turns get
  more steps than chat turns) — measure, don't guess wildly; document choice.
- Re-run the routing eval (scripts/eval-routing.mts, --runs 2-3) after the
  prompt rework and report deltas — the prompt has grown for 4 tickets
  without a check (t30 flagged).

## Constraints

Prompt architecture: REFACTOR prompt.ts into composable sections (persona /
mode instructions / catalog / rules) rather than appending another slab —
it has grown through t21/t29/t30/t31/t38; keep each section's rules intact
(their tests pin the load-bearing text). Preserve ALL shipped machinery
(t16 gate, t19 envelope + resolutions, t29 search, t30 cross-page, t31/t38
bindings, t32 correspondence, t34 receipts). Question cards + chips follow
w2-design-brief.md aesthetics + pressKickerClass conventions. jest+story
proof (persist/parse round-trips, intent detection, chip/question-card
rendering + resolution, lifecycle state machine as a pure module); NO dev
server (orchestrator does the live pass — including a REAL lifecycle run).
Touched-files lint clean. Resolution + status: resolved.

## Resolution (2026-08-29)

Shipped all four parts. Pond is now a thinking partner with a project arc, built
on the incumbent machinery (t16 gate, t19 envelope, t29/t30, t31/t38, t32/t34 all
preserved) rather than around it. The four LOCKED decisions all landed: adaptive
grill, a visible Brief page (prompt-driven through the normal gate), branch-pause
question CARDS, and a quiet phase word in the context bar.

### 1. Lifecycle — a pure state machine (`src/lib/conversation/lifecycle.ts`)

`idle → grill → wayfinding → build-out` as a dependency-free module: intent
detection (a project-shaped ask enters GRILL; MUSING and plain page/edit requests
do NOT, so the routing eval's steward cases survive), the explicit escape hatch
("just build it" → BUILD-OUT), the transition table (the user calls the shot —
`advance`/`escape`/`abandon`/`stay`), the quiet phase word (grilling → charting →
building), and the persist/parse round-trip. The model does the adaptive-grill
REASONING via the prompt; this module tracks/persists the phase and detects
intent/transitions deterministically. 59 jest tests.

### 2. The envelope grows two fields, not a new store

`ConversationResolutions` folds in `questions` (branch-pause answers) and an
optional `lifecycle` (the phase) — same `{messages, resolutions}` envelope,
parsed by their owning modules, re-seeded on load exactly like proposal cards
(t19). `applyResolutions` now stamps an ANSWERED question card as a synthetic
tool result too, so the model reads the user's branch decision and stops asking.
Legacy rows and ordinary-chat rows carry neither (idle stays off the wire).

### 3. Two client-resolved tools + the correspondence UI

`ask_question` (question + 2-4 option chips + free answer) and `suggest_followups`
(≤4 chips) join create_page/propose_changes as no-execute tools whose input
schemas live in `src/lib/conversation/parts.ts` (shared with the eval). Render
side: a `FollowupChips` molecule (quiet Press pills) shared as the question card's
option chips, and a `QuestionCard` molecule (open → answered/inert). Both wired
into AITerminal: cards render in the transcript, answers ride the envelope, a
chip click sends its text. Context bar shows "<project> · <phase>". 10 story
tests + 23 parts jest tests.

Honesty note: "blocks only its branch" is a TAUGHT behaviour, not a mechanical
guarantee — like the t16 propose gate's "never emits unprompted", the prompt
instructs Pond to keep scaffolding the other branches around an open question,
and live passes verify compliance. What IS mechanical: an unanswered card stays
`input-available` (dropped from replay), an answered one is stamped as a
synthetic tool result, and `openQuestionIds`/`briefOpenQuestions` track the open
branches deterministically.

Stuck-in-grill guard (review fix): the CORRESPONDENCE section requires an escape
chip ("just build it" / "enough — chart the route") in EVERY grill-turn's
suggest_followups, and a `grillTurns` counter in the lifecycle state gives it a
deterministic floor — at `GRILL_NUDGE_THRESHOLD` (4) stay-turns the route injects
a `[Lifecycle]` note that this reply's chips MUST include an advance ("turn this
into the plan"). Counter + note are pure and jest-pinned; the chip emission
itself is taught (verified in live passes).

### 4. Step budget by mode + prompt refactor

`stepBudgetForPhase` (documented in `src/app/api/chat/step-budget.ts`): idle/grill
8 (the incumbent), wayfinding 10, build-out 16 — the route reads the phase off the
envelope and sets `stopWhen: stepCountIs(...)` per turn. `prompt.ts` refactored
from one slab into named composable sections (persona / steward / routing /
catalog / structure / research / lifecycle / correspondence / brief), every
eval-pinned rule string preserved verbatim (pinned by `prompt-sections.test.ts`).

### Validation

- **jest**: 54 suites / **756 tests** green (baseline 633 → +123: lifecycle 68,
  parts 23, prompt-sections 23, step-budget 6, resolutions +3). Five assertions
  legitimately updated (four for the new `questions: {}` envelope field; one for
  stay-in-grill now counting a turn).
- **test-storybook**: **149** green (incl. 10 new FollowupChips/QuestionCard tests).
- **tsc --noEmit**: clean.
- **lint**: every touched file clean.
- **routing eval** (`scripts/eval-routing.mts --runs 2`): **44/44** after the
  review-fix round — the first pass surfaced one true regression ("add a recipe"
  on an index page → the model minted a page instead of editing the index),
  fixed with the ROUTING section's DESTINATION SURFACE rule. Full deltas in
  `wayfinder/t39-eval-report.md`.

### Deferred / boundaries

- The **Brief sub-page** is prompt-driven: the BRIEF prompt section teaches Pond
  to maintain it through the normal propose_changes gate; `briefOpenQuestions`
  (in parts.ts, tested) is the pure seam for mirroring open questions on dissolve,
  available but not yet auto-invoked from clear/handoff (the model mirrors them
  when it maintains the Brief).
- **Lifecycle intent/signal are heuristic** (regex over the user message), chosen
  to be conservative so the routing eval's steward cases never regress; the model
  can always override the phase by what it's told. A deterministic upgrade (model-
  emitted phase signal) is the natural next step if a real run mis-detects.
- The REAL end-to-end lifecycle run is the orchestrator's live pass (no dev
  server here, per the token regime).
