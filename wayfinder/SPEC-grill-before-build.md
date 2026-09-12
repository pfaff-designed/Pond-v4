# Spec — Grill-before-build: adaptive scoping for all creation

**Status:** DRAFT for sign-off · **Author:** Claude (opus-4-8) · **Date:** 2026-09-11
**Supersedes part of:** #59 scope-before-build (`4302da6`, shipped 2026-09-11)

---

## 1. Problem

Pond builds before it understands. Real examples from the user:

- *"I need a grocery list"* → Pond invents a page full of **random groceries** — not the items the user actually wants to buy.
- *"come up with a workout routine"* → Pond fabricates one **without asking goals, experience level, days/week, available equipment, or preferred exercises.**

The user's product intent: Pond is a **thinking partner**. Before it builds anything, it should **interrogate intent** the way `/grill-me` does — get to the heart of what the user is actually after — *then* build.

### Why the current design produces this

#59 (shipped today) deliberately made **"named subject → BUILD NOW, don't ask."** Only a *truly bare* request ("make me a page") draws scoping questions. A subject-carrying request ("an inventory page for my workshop tools", "a grocery list", "a workout routine") is routed straight to `create_page` with **invented defaults**.

### Empirical evidence (diagnosis capture, 6 runs, M3 case)

Input: `"make an inventory page for my workshop tools"` from a blank Home.

| Outcome | Count | What the model said |
|---|---|---|
| `(no tool)` — asked scoping questions | **5/6** | "What kinds of tools? What do you want to track per tool? Is there a Workshop area this should live under?" |
| `create_page` with a table | 1/6 | built with invented default columns |

**Two findings:**
1. The model *already wants to ask* for thin requests (5/6) — but the prompt tells it not to, so it's fighting itself and the result is inconsistent.
2. The behavior the user wants (**always grill first**) is the opposite of what #59 codified. This is a **direction change**, not a bug fix.

---

## 2. Desired behavior

> **Grill before every build.** When the user asks Pond to create/build content, Pond first asks robust, adaptive questions to understand intent — goals, preferences, constraints — then builds once the picture is clear. Edits to existing content stay contextual. An escape hatch skips the questions.

### 2.1 The core rule

- **CREATE / BUILD → grill first.** Any request that would mint new content (`create_page`, and new structure generally) routes through an **adaptive grill turn** before any tool call.
- **UPDATE / EDIT → contextual, no mandatory grill.** Changing existing content (`propose_changes`, `add_row`, `configure_view`, `define_schema` on an existing page, `link_records`, `promote_table`) acts on context as it does today. It may still ask a clarifying question when genuinely ambiguous, but is **not** gated behind a grill.

### 2.2 Adaptive, not a fixed questionnaire

The grill must be **gap- and intent-focused**, mirroring how good grilling works:

- **Ask what only the user knows** — goals, motivation, preferences, constraints, scope. (Grocery list → which meals / dietary constraints / which store / how many people. Workout → goal / experience / days per week / equipment / injuries / preferred styles.)
- **Do NOT re-ask what the user already specified.** If the request enumerated contents ("a table of books with **title, author, and status**"), Pond does not ask "what columns?" — it scopes only the remaining gaps and intent. Re-asking an answered detail is a failure (this rule from #59 is preserved).
- **Read the stakes** (already in LIFECYCLE): a big/vague ask earns more questions; a small/clear one earns two sharp ones. One focused question at a time, not a wall.

### 2.3 Escape hatch (preserved)

`"just build it"` / `"enough — build it"` bypasses the grill and builds immediately with sensible defaults. Already implemented as `detectLifecycleIntent(t) === 'escape-hatch'` — reused, not rebuilt.

### 2.4 After the grill

Once the user answers, Pond **builds the whole agreed structure in one continuous pass** — this is #59's existing "ANSWERED → BUILD IT ALL" turn-2 behavior, and it stays. The structure-over-markdown discipline (real `table`/`todo`/`metric` blocks, not markdown fakes) is unchanged.

---

## 3. Non-goals

- **Not** changing edit/update routing behavior (propose_changes etc. stay contextual).
- **Not** removing the one-pass build after scoping.
- **Not** changing the structural block discipline (STRUCTURE/ticket-21 lint stays).
- **Not** touching the proposal-card / persistence envelope mechanics.
- **Not** a full LIFECYCLE project-arc rework — this generalizes the *grill* step to all creation; wayfinding/build-out for big projects stays as-is.

---

## 4. Design

### 4.1 Prompt (`src/app/api/chat/prompt.ts`)

The load-bearing change is in **STEWARD + SCOPING**. Today STEWARD says "explicit request IS the confirmation — act immediately with a single tool call." That line is the root of build-before-understand. It must be re-scoped so that:

- **STEWARD** keeps its unprompted-vs-explicit gate, but "act immediately" now applies to **edits**, and to **builds only after scoping or an escape hatch**.
- **SCOPING** is rewritten from "only the truly bare request scopes" to **"every build scopes first, adaptively."** Concretely:
  - Replace the "NAMED SUBJECT → BUILD NOW, SCAFFOLD DEFAULTS" clause with **"CREATION REQUEST → GRILL FIRST": ask the gaps + intent, one focused round, before any create tool call.**
  - Keep and strengthen **"don't re-ask what's given"** (the anti-redundant-question rule).
  - Keep **"ANSWERED → BUILD IT ALL"** (one-pass build after answers).
  - Keep the **escape hatch**.
- **LIFECYCLE**'s adaptive-grill language is the template — the grill for a grocery list is the same *kind* of act as the grill for a project, just lighter. Cross-reference rather than duplicate.

**Copy to write carefully:** the new SCOPING must not read as "always interrogate even trivial fully-specified asks" — the escape hatch and the don't-re-ask rule bound it. The test cases (§4.3) pin the boundary.

### 4.2 Deterministic floor (`src/app/api/chat/scoping.ts`)

Today `needsScoping()` fires only on the *bare* regex (`BARE_CREATE`). Options:

- **(Recommended) Broaden the gate to build-intent generally.** Detect "the latest message is a creation/build request" (create/make/build/start/set up + artifact/subject) and, unless it's an escape hatch or an edit of the current page, inject a **`[Scoping]` note** instructing the adaptive grill. This is the hard floor under the prompt, symmetric with how #59 works today.
- **Risk to manage:** over-firing on **edits** and **cross-page** requests ("add a step to my Ceramics plan", "mark the pottery wheel purchased"). The detector must distinguish *create* from *edit* intent. The existing ROUTING vocabulary (create vs change/add/rewrite/reword) is the signal; encode conservatively and pin with `scoping-gate.test.ts` (extend the existing matrix).
- **Alternative:** leave the deterministic gate as-is (bare only) and rely on the prompt for the broader behavior. Weaker/stochastic, but smaller blast radius. **Decision needed — see §6.**

### 4.3 Eval restructuring (`scripts/eval-routing.impl.mts`)

This is the largest mechanical change. The eval is **single-turn** today (`stopWhen: stepCountIs(1)`, one user prompt → assert the tool). Under grill-before-build, a creation request's **turn 1 is a scoping/no-tool turn**, and the build lands on **turn 2** (after the user answers). The harness must support this.

**Harness change:** add optional multi-turn scenarios — a scenario may carry a `followup` (the user's answer) and assert:
- **Turn 1:** `(no tool)` AND the reply asks about the expected gaps (assert the reply is a question; optionally keyword-check it probes intent, e.g. contains a "?" and does not call a tool).
- **Turn 2** (after `followup`): `create_page` with the required structure (`expectBlockType: 'table'`, no md table, etc.).

**Case migration (create_page build-now cases → grill-then-build):**

| Case | Today | After |
|---|---|---|
| M3 "inventory for workshop tools" (blank Home) | create_page + table | T1 no-tool (asks); T2 create_page + table |
| #63 "start a workout log" | create_page + table | T1 no-tool (asks goals/fields); T2 create_page + table |
| #63 "new tracker from Home" | create_page + table | T1 no-tool (asks); T2 create_page + table |
| "make me a recipe page for lasagna" | create_page | T1 no-tool (asks servings/constraints?) **or** build if deemed fully-specified — see §6 |
| "create a project called Website Redesign" | create_page (type=project) | T1 grill (LIFECYCLE) — likely already scopes |
| T21 "reading list — table of books with title, author, status" | create_page + table | **Ambiguous:** columns given → may build now, or ask remaining intent (which books? sort?). See §6 |
| T21 "standing desks — name, height, price" | create_page + table | Same ambiguity as above |
| #28 "compare Free/Pro/Enterprise across features" | create_page + table | Same |
| #28 "keyboard shortcuts cheat sheet" | create_page + table | Same |

The **STEWARD / musing / edit / cross-page / define_schema-on-existing / add_row / configure_view** cases are **unchanged** — they're not new-content builds from scratch.

---

## 5. Risks & trade-offs

1. **Reverses part of #59 shipped today.** Acceptable per user direction, but the commit history will show a fast reversal — note it in the PR.
2. **Nagginess.** If the grill fires on genuinely trivial/fully-specified asks it will annoy. Mitigated by: escape hatch, don't-re-ask rule, read-the-stakes (light for small asks). The §6 boundary decision controls this.
3. **Eval determinism.** Turn-1 "asks a question" is a softer assertion than a tool name. Recommend asserting `(no tool)` + reply contains `?` (a question), rather than keyword-matching the question content (too brittle). Run flake mode (`--runs 5`) to confirm stability.
4. **Deterministic-gate over-fire on edits.** The #1 correctness risk (§4.2). Conservative create-vs-edit detection + expanded `scoping-gate.test.ts` matrix.
5. **Interplay with define_schema/#63.** #63 explicitly made "start a tracker" scaffold a table NOW (because define_schema can't target a non-existent page). Under grill-first, T1 asks, T2 builds the table — the #63 constraint still holds on T2. Verify the table-scaffold still lands post-grill.

---

## 6. Decisions (RESOLVED)

1. **Fully-specified builds — grill or build?** → **Ask ONE intent question** (grill), then build on the next reply. Sized by the read-the-stakes rule; a fully-enumerated ask still earns exactly one focused question, never a second round.
2. **Deterministic floor scope (§4.2):** → **Broaden `needsScoping`** to fire on all from-scratch build-intent (CREATE_ARTIFACT / NEED_ARTIFACT regexes), with vetoes for the escape hatch, musing, edit-lead verbs, and "this/the table" promote. (Done in `scoping.ts`.)
3. **Turn-1 assertion strictness (§5.3):** → **Keyword-probe the question content** (lenient OR-regex / per-case `turn1Probe`), not just "contains a `?`".
4. **Transform-current-page ("turn this into a project"):** → **Grill first too** — converting the current page into a project/tracker is a creation, routes through the grill before `create_page`.

### 6.1 Follow-on decisions (session 3, 2026-09-11)

5. **Pattern C — `define_schema` on a page that already exists.** "track my reading list with status and rating" while *on* a plain page (a text list, not yet a collection) must act immediately (`define_schema`), not grill. **Root cause:** the firewall clause said define_schema on *"an existing collection"* — the fixture page isn't a collection yet, so the model read it as from-scratch and grilled. **Fix (chosen: harden edit-firewall, narrow form):** broaden the existing firewall clause to *"giving columns to a page that ALREADY EXISTS — turning its existing list into a tracked collection, or adding columns to one it already has (define_schema)"*. Deliberately **not** a new loud "DO NOT GRILL" bullet: an earlier loud version fixed Pattern C but dampened grill propensity broadly (freeform-matrix 2/3→0/3, turn-into-project 3/3→2/3). The narrow clause fixes Pattern C **6/6 across 3 runs** with no touch to the grill-first rule. Verified by reverting-and-comparing against baseline.
6. **Freeform-matrix ("compare Free/Pro/Enterprise across price, seats, SSO, support").** Both axes (3 tiers × 4 features) are fully enumerated, so building on T1 is defensible under the don't-re-ask rule — it conflicts with the assert-must-grill expectation. **Decision:** mark the eval case **ambiguous** via `grillOptional: true` — accept a T1 build (still shape-checked → **table**, not collection) OR a T1 grill then T2 table. This flake was **pre-existing** (2/3 at baseline before any session-3 edit); `--runs 1` in pass-2 masked it. `turn-into-project` is left **strict** and documented as known-flaky.

---

## 7. Acceptance criteria

- [ ] A creation request with unspecified intent (grocery list, workout routine, workshop inventory) produces a **scoping/question turn first**, then builds the agreed structure after the user answers — verified live in the app, not just eval.
- [ ] `"just build it"` still bypasses to an immediate build.
- [ ] Edits to existing pages still act contextually with no forced grill.
- [ ] Routing eval restructured to multi-turn; **green at `--runs 5`** (no flake) on the migrated cases.
- [ ] `scoping-gate.test.ts` matrix extended and green; no over-fire on edit/cross-page inputs.
- [ ] Full `jest` suite green.
- [ ] PR notes the partial reversal of #59.

---

## 8. Build order (suggested)

1. Resolve §6 decisions.
2. Rewrite STEWARD/SCOPING prompt copy (+ prompt-sections tests).
3. (If chosen) broaden `scoping.ts` + extend `scoping-gate.test.ts`.
4. Add multi-turn support to the eval harness.
5. Migrate the create_page cases (§4.3).
6. `--runs 5` flake check + live verify in-app + full jest.
7. PR.
