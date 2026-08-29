---
id: 39
label: cycle-3:spine
status: open
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
