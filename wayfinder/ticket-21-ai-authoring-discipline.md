---
id: 21
label: ux-audit:finding
status: resolved
blocked-by: []
blocks: []
---

# AI authors markdown prose where structured modules exist

## Problem

The AI is inconsistent about using the module catalog it's taught (t16):

- On the workout page it wrote **pipe-syntax markdown tables inside text
  blocks** — while on Fall Reading List (created the same day via `create_page`)
  it correctly used the real table module, which renders beautifully.
- Section headings are markdown `###` inside text blocks rather than any
  structured form.
- The first block of AI-created pages **repeats the page title** as a `##`
  heading (`## 📚 Fall Reading List` under the title "Fall Reading List").

Result: whether a page looks premium is a coin flip on which shape the model
happened to emit. Ticket-20 makes markdown render; this ticket makes the AI
prefer structure so tables/headings land as modules the registry can render,
diff, and edit.

## Direction (not yet designed)

- Sharpen the t16 system-prompt catalog / tool descriptions: tables → table
  module, never pipe syntax in text; no title-echo heading block.
- Consider an emit-time lint (server, in the Route Handler, where t16's
  discriminated-union check already runs): reject/flag text-module payloads
  that are clearly a markdown table.
- Add gauntlet cases to the ai-page-creation evals so regressions get caught
  (JUDGEMENTS-ai-page-creation.md harness).

## Origin

Hands-on UX audit, 2026-08-27 — same session that created Fall Reading List
(`~/ux-05-create-proposal.png`, `~/ux-06-created-page.png`).

## Resolution (2026-08-27)

Shipped all three layers of the direction. Structure-over-markdown is now taught
in the prompt, enforced at the emit-time gate, and guarded by tests.

### What shipped

**1. Sharpened prompt + tool descriptions.** `src/app/api/chat/prompt.ts` gains a
"Prefer STRUCTURE over markdown-shaped text" block right after the registry-derived
`moduleCatalog`: tabular data → `table` module (never a `|…|` pipe table with a
`|---|` rule inside text); task/step lists → `todo`; single figures → `metric`/
`metric-ring`; and an explicit "do NOT make the first block a heading that repeats
the page title" clause. `createPageTool.description` and its `blocks` field
description in `src/app/api/chat/tools.ts` carry the same two rules so the model
sees them at the create surface.

**2. Emit-time lint (server, at the t16 validation gate).** Two pure heuristics in
the new `src/lib/modules/authoring-lint.ts`:
- `isMarkdownPipeTable(content)` — flags a text body containing a GFM pipe table
  (a `|---|` separator line PLUS a header row and ≥1 body row of ≥2 pipes each).
  Deliberately specific: prose that merely contains a `|` (or several) with no
  separator rule is never flagged.
- `isTitleEchoHeading(content, title)` — flags a first-line `#`/`##`… heading whose
  normalized text (emoji + markdown marks stripped, case/whitespace-folded) equals
  the page title.

These are wired as **Zod refinements on the real tool schemas** (t16 branch 7), not
a bespoke check: the pipe-table refinement lives on the `text` variant of
`moduleDataSchema` (so it fires for BOTH `propose_changes` and `create_page`
payloads); the title-echo refinement is a `superRefine` on `createPageTool`'s input
(it needs both `title` and `blocks[0]`, and the anti-pattern is specific to
AI-created pages — `propose_changes` carries no page title to compare against).

### Enforcement decision: REJECT (schema gate) → model self-corrects

Rejection over auto-annotation. A failed refinement fails the tool-input validation
gate, which triggers the already-wired `repairToolCall` pass (`src/lib/ai/repair.ts`)
— re-asking the model to produce valid arguments. For a pipe-table-in-text, "valid"
means re-emitting as a `table` module; the refinement's corrective message
(`PIPE_TABLE_IN_TEXT_MESSAGE` / `TITLE_ECHO_MESSAGE`) names the exact fix. This is
the only enforcement that yields the STRUCTURED module the registry can render/diff/
edit; auto-annotation would freeze bad markdown into a text block forever. It reuses
the existing "emit IS the server-side gate" mechanism with zero new write handler and
no new route surface — the lint is purely additive to the discriminated-union check.
Refinements don't translate to the JSON schema the model is shown, so the model is
not pre-constrained (it can still emit the mistake) — it's just corrected on emit,
which keeps the repair loop's second-chance intact.

Note: the refinements guard AUTHORING (the AI-emit path) only. The persisted
`textSchema`/`tableSchema` are untouched, so nothing already saved becomes invalid
and hand-typed user prose is never linted.

### Tests / evals

- `src/__tests__/authoring-lint.test.ts` — 25 jest cases: positive/negative for both
  heuristics (real markdown fixtures; explicit "legitimate prose with a `|`" negative
  cases), PLUS wiring assertions that a pipe-table text payload and a title-echo
  `create_page` input actually fail their real Zod gates while the structured
  equivalents pass. This jest coverage is the proof.
- `scripts/eval-routing.impl.mts` — three new live-API gauntlet cases (reading-list →
  real table + no md-table + no title-echo; standing-desk comparison → table; plain
  note page → no title-echo), plus a new `expectNoTitleEcho` assertion using the real
  `isTitleEchoHeading` helper. Cases added, NOT run live here (per ticket scope).

### Deferred / not done

- **Markdown section headings inside prose (the `###` observation).** A `##`/`###`
  used as a genuine in-prose section header is left as legitimate text — only a
  first-block heading that ECHOES the page title is rejected. Promoting arbitrary
  headings to a structured `section`/`heading` module is out of scope until t18
  (section) lands; there is no heading module to route them to yet.
- **Bullet/number list → todo, and figure → metric** are TAUGHT in the prompt but
  NOT lint-enforced (no reliable, false-positive-safe heuristic — a markdown bullet
  list is often legitimate prose). Left as prompt-only nudges; revisit if the audit
  shows the model still faking checklists in text.
- **propose_changes title-echo.** Not enforced (the edit payload carries no page
  title). Only relevant on create, which is where the anti-pattern was observed.
- **Live eval run.** The new gauntlet cases were added but not executed against the
  API (jest is the proof, per ticket scope); run `node --env-file=.env.local
  scripts/eval-routing.mts --runs 3` when spending eval budget to confirm the model
  now clears them end-to-end.
