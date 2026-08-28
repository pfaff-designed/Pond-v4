---
id: 31
label: cycle-2:second-brain
status: resolved
blocked-by: []
blocks: []
---

# Living numbers: metrics that lie, tables that don't add

## Problem

Audit finding 1 (major): the AI created "Milestones Complete — 0 of 4" as an
UNBOUND metric; checking items changed nothing — a static number that silently
lies. Root cause: ticket-23's documented boundary (bindings target existing
blocks only; same-batch ids don't exist at emit time), so the AI cannot bind
the metric to the checklist it creates in the same page.

Finding 12: a 16-row "Budget Planner" table has no totals — the math lives
only in chat, never on the page.

## Direction

1. **Same-batch bindings** — symbolic refs: let a create op reference an
   earlier op in the same changes[] batch (e.g. source.ref = op index or a
   batch-local key); the client resolves refs to real ids at accept time when
   it mints them. Update the t16 schema + accept path + catalog teaching, so
   the AI binds metrics it creates with their checklists. (This closes t23's
   deferred item.)
2. **Table numeric intelligence** — a table module option (sum footer over a
   numeric column; parse "$459 (bought!)" leniently); AI taught to enable it
   for budget-shaped tables. Stat-chip rollups optional stretch.
3. **Bound metrics animate** — count-up on change (number-flow dep already in
   package.json).

## Rules (cycle 2)

Front-end + functionality → mobbin/impeccable/design-knowledge for the footer +
metric treatment; live Playwright verify (create plan page via AI → metric
bound → check item → metric ticks; table shows sum). /code-review.

## Origin

Cycle-2 audit findings 1 + 12; closes ticket-23 deferred same-batch binding.

## Resolution (2026-08-28)

All three directions shipped and live-verified. Metrics no longer lie; budget
tables add up on the page; bound numbers count up.

### 1. Same-batch bindings — symbolic refs (closes t23's deferred item)

A metric can now bind, in ONE `changes[]` batch, to a checklist/table created in
the same batch — the AI no longer has to split it across two turns.

- **Ref scheme.** The t16 create op carries an optional batch-local `key`
  (`{ op: 'create', key: 'chores', data }`); a metric's `source` is now a Zod
  UNION — `{ blockId, kind }` (existing block) **or** `{ ref, kind }` (a `key`
  emitted in the same batch). Exactly one side; the union forbids neither/both
  (a stray `ref` alongside `blockId` is stripped to the safe blockId form).
- **Client resolves at accept time, single pass.** `pages/edits.applyProposedChanges`
  now pre-mints one id per create op FIRST (so a metric can ref a create that
  appears LATER in the array), builds a `key → minted-id` map, then rewrites every
  `source.ref` → the real `blockId` before hydration
  (`modules/same-batch-refs.resolveSourceRef`). **Unknown ref** (its create was
  rejected, or the key was never emitted) → the whole `source` is dropped, so the
  metric falls back to its manual `value` and **never dangles**. What persists is
  ALWAYS the ordinary `{ blockId, kind }` form — a `ref` never reaches storage, so
  t23's serialize honesty holds (post-accept a ref-bound metric is a normal blockId
  binding).
- **Catalog teaching.** The metric descriptor now teaches the `key`/`ref` pairing
  and says the AI can and SHOULD create a checklist + its bound metric together.
  `create_page` has no `key` mechanism (its blocks carry no keys) — a stray `ref`
  there resolves against an empty map and drops cleanly; same-batch binding is a
  `propose_changes` affordance.
- **Jest**: `same-batch-refs.test.ts` (resolver in isolation + end-to-end through
  `applyProposedChanges`: the core checklist+metric proof, a ref to a LATER create,
  unknown-ref drop, partial-accept where the source create is rejected → binding
  falls back manual, and a resolvable-ref-but-malformed metric still skipped by the
  accept gate). `ai-composition.test.ts` extended (keyed create, ref source,
  both-keys→blockId).

### 2. Table sums

- `table` schema gains an opt-in `sumColumn?: number` (0-based index). The view
  renders a `<tfoot>` "TOTAL" row in Press language (heavier top hairline,
  uppercase muted label, semibold `tabular-nums` figure) that recomputes every
  render — an inline cell edit re-totals live. The total carries the column's own
  `$`/`%` affordance when the cells share one.
- **Lenient parser** (`modules/table/sum.ts`): strips currency + thousands commas +
  trailing notes ("$459 (bought!)" → 459); leading-minus and parenthesised
  accounting negatives ("(45)" → −45); **ranges → midpoint** ("$20–60" → 40, "10 to
  15" → 12.5) — documented choice, the most honest single estimate; percentages keep
  their number; junk/blank/lone-dash → null and is SKIPPED (never counted as 0).
  `sumColumn` totals only the cells that parsed. Serialize appends the total so the
  AI's context + embeddings match the page. Catalog teaches enabling it for
  budget-shaped tables. Hard-fenced in `table-sum.test.ts`.

### 3. Bound metrics animate

The metric view counts up via `@number-flow/react` when a **derived** value changes
(unbound/stale stays static — nothing to animate). Same not-yet-defined-element
guard as `chart-stat-flow`; a jest mock (`__mocks__/number-flow.tsx`, wired in
`jest.config.ts`) stubs the pure-ESM custom element in jsdom. The value span gained
`role="status"` + an aria-label carrying the plain figure so assistive tech (and the
story test) read one stable string while digits animate.

### Live verify (Playwright, own server :3031) — both core proofs passed

- **Same-batch bound metric.** Via the real AI, one `propose_changes` batch produced
  a 5-item pottery checklist **and** a "Steps done" metric _"bound to the checklist
  above"_ — accepted together; checking items ticked the metric 0 → 1 → 3 live with
  the `→` source link (derived, not manual). Screenshots `~/t31-verify-1..3`.
- **Table sum footer.** AI enabled `sumColumn` on a budget table → footer TOTAL $305
  on the card and on the page; editing a cell ($120 → $200) re-totalled to $385 live.
  Screenshots `~/t31-verify-4..5`.
- Test page "T31 Pottery Sprint" deleted via the UI afterward; "Ceramics Studio Plan"
  left untouched. No ticket-31 console errors (only a transient Supabase
  `ERR_NETWORK_CHANGED` on a title-save, unrelated).

### Validation

`npm run typecheck` clean. `npm test` → 37 suites / 389 tests pass. `test-storybook`
→ 84 pass (incl. metric BoundLive count-up on a real NumberFlow, table `SumFooter` +
`SumFooterLiveEdit`). Lint: every file this ticket touched is clean; repo-wide count
unchanged from `main` (pre-existing problems all in `src/components/charts/` +
`src/app/proto/`).

### Deferred / boundaries

- **create_page same-batch binding** — no `key` mechanism there (its blocks carry no
  keys); a `ref` inside create_page drops cleanly. Fold in if a real case wants a
  bound metric scaffolded at page-creation time (would need per-block keys on the
  create_page blocks array).
- **Range→midpoint** is the documented choice; a "min/max/first" policy could be a
  per-column option later.
- Table **column-predicate** metric bindings (t23's other deferred `kind`) still
  open — orthogonal to this ticket.
