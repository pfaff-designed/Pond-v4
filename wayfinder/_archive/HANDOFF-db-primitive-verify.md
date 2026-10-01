# Handoff — DB Primitive verify + fix plan (2026-09-06)

## Where we are

Read `wayfinder/ROADMAP-notion-parity.md`. F24 (SMS) **deferred by user**. Everything else on the
roadmap is merged to `main`; the doc is **stale** (still lists shipped work as Banked/verify) —
refresh it at some point. Only open issue was #14 (F24).

This session ran a **live end-to-end `/verify` of the Database Primitive** epic, driving Pond
conversationally in `/sandbox` (dev server on :3000, already running as PID 40352; a 2nd
`npm run dev` will fail on port-in-use — reuse the existing one). Full findings saved to memory
note `project_pond_db_primitive_verify`.

## Verdict: PASS with 3 gaps

**Works (observed in running app):** define_schema (typed props render + persist), collection
(type `inventory`, rows = child `row` pages), add_row (incl. partial data), table view
(inline-editable), board view (grouped by Status, correct buckets), view-swap (single active
view, no data loss), relation property (+ resolved-target preview fef740b), link_records (chips
persist, chip→page nav), backlinks #39 ("Linked from — Reading List · Author link — Dune"),
**rollup happy path** (count over a LOCAL relation = 1/0/1 correct). No console errors.

## The 3 gaps to fix (grill+spec first per AGENTS.md)

### 1. Rollup-over-backlink unsupported — HEADLINE, do first

- `src/lib/modules/view/use-rollup.ts:80` + `compute-rollup.ts`: a rollup needs a **local stored
  relation** on the same row (`relationDef` + stored `linkedIds`). No local relation → `"—"`.
- Repro: a "Books count" rollup on **Authors** counting books (relation stored on the Reading
  List side) is structurally uncomputable → always `"—"`. **Pond proposed it and reported
  success anyway.**
- Fix (a) — cheap/high-value: AI guidance in `src/app/api/chat/prompt.ts` + `define_schema`
  validation (`src/lib/properties/schema.ts` / tools.ts) to **refuse + explain** (or place the
  relation on the correct side) when a rollup has no local relation on the target collection.
- Fix (b) — bigger/optional: let a rollup source a **derived backlink** (see
  `src/lib/modules/view/use-backlinks.ts`). Only if reverse-counts are actually wanted.
- **Recommendation: ship (a) now; defer (b).**

### 2. Misleading multi-view UX — S

"table AND board" reported two "View configured" successes, but a collection holds ONE active
view; 2nd silently swaps 1st. Fix = honest receipt language ("switched active view") in the
configure_view proposal/receipt, OR support multiple named views. (`src/lib/modules/view/`,
configure_view tool + receipt copy.)

### 3. Duplicate Name/Title column — S

`define_schema` "Title" text prop duplicates the intrinsic page title (rendered as "Name" col);
the Title col is empty for every row. Fix = map a title-like prop onto the page title, or have
create/define_schema avoid minting a Name-duplicate.

Minor/pre-existing (not this epic): sandbox kanban card "Mill stock" flagged "missing" (stale
F27 link).

## Next action

Fresh session → grill (`/grill-me`) + spec (`/spec`) **fix #1(a)** first (it actively misleads);
#2 and #3 are small and can ride along. Then build via the orchestrator pattern
(`.claude/workflows/ship-issue.mjs`, see memory `feedback_orchestrator_pattern`), live-verify in
`/sandbox`, ship.
