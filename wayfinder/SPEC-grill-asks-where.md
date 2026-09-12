# SPEC — Grill also says _where_ the new page will live

**Status:** BUILT + live-verified · 2026-09-12 · follow-up to PR #76 (grill-before-build)

## Build notes (2026-09-12)

- **Attempt 1** (soft one-liner bullet) was **flaky 1/5** at `--runs 5`: the model grilled
  intent but omitted placement (silently inferred `parentTitle` on T2). The surrounding
  "ONE sharp question" discipline + the create_page "picker corrects it, don't re-ask"
  guidance outgunned it.
- **Attempt 2** (shipped): reworded the bullet to make placement a REQUIRED part of the
  SAME turn-1 message — "SAY WHERE IT WILL LIVE — IN THE SAME BREATH", explicitly a
  statement riding alongside the one intent question (not a second question), and forbade
  deciding the home silently / deferring to the card alone. → **5/5** at `--runs 5`.
- Full eval **30/30** (no regression; existing placement/inference/guard cases green),
  jest **1461** pass, tsc 0.
- **Live-verified** on :3001: from Home, "create a reading list" → grill asks purpose AND
  states "I'll put this under your workspace's top level since I don't see an obvious home
  — say if it should live elsewhere" + "just build it". (Chose top-level and _said so_,
  matching "top-level is the fallback, not the silent default.")

## Problem

The grill-before-build gate asks _what_ (intent/columns) but never _where_ a new page
will live. A user creating a reading list from Home (or from an unrelated page) is never
told where it lands until the `create_page` proposal card's "Save to" picker appears.
User wants: "if I start talking about creating something new, it should ask me if I want
it created **and where**."

**Not a bug in current behavior** — verified live on merged `main` (2026-09-12): "create a
reading list" on an unrelated page correctly _grills_ and does _not_ hijack the current
page. The original report was a 3½-day-stale dev server. This spec is the _enhancement_.

## Decision (resolved via grill, 2026-09-12)

- **Infer + confirm (soft), only when unsure.**
  - When the model can **confidently infer** the home (current node + `[Workspace outline]`,
    which is already injected every turn), it **STATES** it inside the same grill message
    — _"I'll create this under Personal — tell me if it should live elsewhere"_ — a
    statement the user can override, **not** a required question.
  - It **ASKS** where only when placement is **genuinely ambiguous** (nothing in the
    outline plausibly fits, or several homes are equally likely), folded into the **same
    single grill round**.
  - **Never a second round.** Honors SPEC-grill-before-build §6 decision 1 (one intent
    question, converge on the next reply). Placement rides that one round.
  - The build carries the stated/confirmed home into `create_page.parentTitle` (existing
    inference at `prompt.ts:84`); the card's destination picker stays the correction surface.

## Scope of change (minimal)

1. **`src/app/api/chat/prompt.ts` — SCOPING section only.** Add one bullet ("SAY WHERE IT
   WILL LIVE") between READ-THE-STAKES and ESCAPE-HATCH. No change to ROUTING/create_page
   (inference + picker already exist), no change to `scoping.ts`, no UI change.
2. **`src/__tests__/prompt-sections.test.ts`** — update if it asserts on SCOPING contents.
3. **`scripts/eval-routing.impl.mts`** — add ONE case: from Home, an unrelated/ambiguous
   subject → turn-1 grill **mentions placement** (probe: `where|live|top.level|under|area|
place|put`). Keep it light to avoid re-introducing turn-1 flake; confident-inference
   placement is already covered by the existing `expectParent` cases (parentTitle on T2).

## Out of scope

- The observed "answered a decision card but no build fired / no 2nd `/api/chat`" glitch
  (flagged separately; may be expected).
- Any destination-picker UI change.

## Acceptance

- [x] From Home, ambiguous subject ("create a reading list") → grill's turn-1 message
      raises _where_ (states top-level home + invites redirect). Live-verified.
- [x] Confident case (subject maps to an existing area) → grill STATES the home; T2
      `create_page.parentTitle` matches. Eval "states WHERE" case 5/5 (`expectParent: personal`).
- [x] "just build it" still bypasses (escape-hatch button present; eval escape case green).
- [x] Edits still never grill (unchanged; eval edit/STEWARD cases green).
- [x] Eval green (30/30 full; new case 5/5 at `--runs 5`, no new turn-1 flake); jest 1461.
