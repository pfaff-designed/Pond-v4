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

A metric can now bind, in ONE batch, to a checklist/table created in the same
batch — in BOTH authoring surfaces (propose_changes and create_page). The AI no
longer has to split it across two turns.

- **Ref scheme.** A create — a propose_changes `create` op OR a create_page block
  entry — carries an optional batch-local `bindKey` (`{ op: 'create', bindKey:
'chores', data }` / a `bindKey` field on the block entry). A metric's EMIT-time
  `source` is a union — `{ blockId, kind }` (existing block) or `{ ref, kind }` (a
  `bindKey` in the same batch). The PERSISTED `metricSourceSchema` is **blockId
  only** (emit/persisted split, per the t21 precedent): an unresolved `ref` FAILS
  `blockSchema` validation in `hydrateBlock` and is skipped — "a ref never reaches
  storage" is structural, not convention. A stray `ref` alongside `blockId` is
  stripped to the safe blockId form (union order).
- **Accept-time resolution** (`modules/same-batch-refs.ts`): `collectBatchRefIds`
  builds the `bindKey → minted-id` map over the **FULL proposal batch** (not just
  the clicked subset) — mapping a key ONLY if its create's data passes a validation
  probe (a create that will be skipped can never be a binding target) and was not
  explicitly REJECTED (rejection state read from the t19 resolutions envelope).
  `resolveSourceRef` then rewrites each `source.ref` → the mapped `blockId` before
  hydration; an unknown ref drops the whole `source` (metric lands manual, never
  dangles). Chained key→key bindings are deliberately unsupported.
- **Per-change accepts stay consistent.** Minted ids are remembered per proposal in
  a caller-owned `refIds` record (AITerminal holds one per toolCallId, in a ref):
  accept the checklist then the metric → the metric binds to the landed id; accept
  the metric FIRST → it binds to the id RESERVED for the pending checklist, which
  then lands with that same id, healing the binding. The memory is session-scoped
  by design — after a reload a later ref degrades to the clean manual fallback.
- **create_page parity** (review fix — the original audit finding was exactly a
  create_page metric that couldn't bind to its own checklist). `blocks` entries
  accept `bindKey` via `createPageBlockSchema` — a dedicated discriminated union
  with `bindKey` extended onto every member (NOT an intersection: `allOf` would
  clash with the branches' `additionalProperties: false` in the derived JSON tool
  schema). `hydrateProposalBlocks` runs the same collect+resolve pass; `bindKey`
  is authoring-only and is stripped by schema validation before persisting. The
  t21 pipe-table lint is re-applied on the keyed text branch.
- **Catalog teaching matches reality** (review fix): the metric descriptor teaches
  the `bindKey`/`ref` pairing and names BOTH surfaces (propose_changes op,
  create_page block entry); the create_page `blocks` field description teaches it
  too. Pinned by jest so a catalog edit can't silently reopen the
  teach-where-it-drops gap.
- **Jest**: `same-batch-refs.test.ts` — resolver pieces in isolation
  (`resolveSourceRef`, `collectBatchRefIds` incl. validation-probe and rejected-key
  exclusion, persisted-schema-rejects-ref) + end-to-end through BOTH accept paths:
  the core checklist+metric proof, ref to a LATER create, split accepts across
  calls in both orders, rejected-source fallback, malformed-keyed-source (phantom
  fix), malformed metric still gated, create_page born-live page + unknown-ref
  drop. `ai-composition.test.ts` — keyed create, ref source, both-keys→blockId,
  `createPageBlockSchema`, catalog pins.

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
  budget-shaped tables. Hard-fenced in `table-sum.test.ts`. All display formatting —
  including the shared `$`/`%` affordance detection — lives in `sum.ts` with the
  parser (review cleanup), so the view holds no cell-parsing knowledge.

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

### Review-fix round (2026-08-28, same day)

/code-review traced the mechanism sound and passed the aesthetic ("Press-grade
restraint") with four must-fixes, all shipped:

1. **create_page catalog gap (audit bug reborn)** — the catalog taught key/ref
   binding while create_page silently dropped refs. Fixed on BOTH ends: create_page
   blocks now genuinely support `bindKey` (see §1), and the catalog names both
   surfaces explicitly — pinned by jest.
2. **Per-change accept lost bindings** — refs used to resolve per Accept click.
   Now resolved against the FULL stamped batch with per-proposal id memory
   (`refIds`), so split accepts bind in either order (jest: both orders).
3. **Phantom-blockId dangle** — a keyed create that failed validation could still
   be mapped, persisting a binding to an id that never lands. `collectBatchRefIds`
   now maps only creates that pass a validation probe (jest: malformed keyed
   source → binding drops, metric lands manual).
4. **Emit/persisted schema split** — the persisted `metricSourceSchema` is blockId
   only; the ref form lives solely in the emit union (`ai-composition`). A missed
   resolve now fails validation instead of persisting a ref (jest fence).

Cleanups: `key`→`bindKey` (self-describing); `formatTotal` moved into `sum.ts`
(all cell-encoding knowledge in one module); NumberFlow mock comment no longer
overclaims (the story asserts the VALUE through the real element; the animation is
verified by eye); `sumIndex!` assertion removed (footer resolved in one helper).

### Validation

`npm run typecheck` clean. `npm test` → 37 suites / 404 tests pass. `test-storybook`
→ 84 pass (incl. metric BoundLive value-through-real-NumberFlow, table `SumFooter` +
`SumFooterLiveEdit`). Lint: every file this ticket touched is clean; repo-wide count
unchanged from `main` (pre-existing problems all in `src/components/charts/` +
`src/app/proto/`).

### Deferred / boundaries

- **Range→midpoint** is the documented choice; a "min/max/first" policy could be a
  per-column option later. Accepted quirk: a **date-shaped cell** ("2026-08-28",
  "3-5 Jun") parses as a range → midpoint and would contribute a number; don't
  point `sumColumn` at date columns (the AI is taught money/quantity columns).
- **refIds memory is session-scoped** — a reload between split per-change accepts
  loses the reservation; a later ref then degrades to the clean manual fallback
  (documented in `same-batch-refs.ts`). Persisting it in the t19 resolutions
  envelope is the upgrade path if this ever bites.
- **Chained key→key bindings** (a keyed metric that itself refs another key) are
  unsupported — the validation probe treats an unresolved ref as invalid.
- Table **column-predicate** metric bindings (t23's other deferred `kind`) still
  open — orthogonal to this ticket.
