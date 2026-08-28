---
id: 23
label: ux-audit:finding
status: resolved
blocked-by: []
blocks: []
---

# "Live data" isn't live — the same fact exists three times, unconnected

## Problem

Fall Reading List (AI-created, 2026-08-27) seeded the same three books as:

1. a **table module** with a Status column ("To Read"),
2. a **checklist** of the same three titles,
3. a **"Books Finished" metric** at 0.

Checking off "Dune" in the checklist changed nothing else: metric stayed
`0 books`, table still "To Read". The metric's `→` affordance does nothing at
all. Same pattern on the 3-Day routine page (checklist of weeks + two manual
metrics, unbound).

This undercuts the core product promise — dashboards over _live_ data. Three
representations, three sources of truth, all manual.

## Direction (not yet designed — grill before build)

This is the most product-defining ticket of the audit set; run /grill-me on it.
The branches:

- **Derived modules**: a metric that _binds_ to another block (count of checked
  items in checklist X; count of table rows where Status = Read). Needs a
  reference/expression shape in the metric schema — a real extension of the
  t12/t16 contract, and the compelling product move.
- **Authoring discipline instead**: teach the AI to pick ONE canonical
  structure per fact (table with status OR checklist + derived count, never
  both). Cheaper, avoids the binding machinery, but forfeits the live-dashboard
  story.
- Likely both: discipline now (fold into ticket-21's catalog work), bindings as
  the designed follow-up.
- Decide the `→` affordance on metric: link-to-source, manual increment, or
  remove until bindings exist. A dead control reads as broken.

## Origin

Hands-on UX audit, 2026-08-27 (`~/ux-06-created-page.png`). Reproduce: Personal
→ Fall Reading List, check any box.

## Resolution (2026-08-27)

Shipped the **derived-metric** branch (bindings), the product-defining move. An
unbound metric keeps today's manual behaviour byte-for-byte; a bound one derives
its value live from a sibling block.

### What shipped

- **Metric binding schema** (`src/lib/modules/metric/schema.ts`). A Zod extension
  of the existing metric descriptor (t12 single-source-of-truth — same schema
  feeds the TS type, runtime validation, and the AI tool input):

  ```ts
  source?: {
    blockId: string
    kind: 'checklist-checked' | 'checklist-total' | 'table-rows'
  }
  ```

  Optional. Absent → the metric shows its manual `value` exactly as before.

- **Pure derivation** (`src/lib/modules/metric/derive.ts`, server-safe, no React).
  `deriveMetricValue(metric, siblings)` → `{ state: 'unbound' | 'derived' |
'stale', value, sourceId? }`. Owns the one place a binding + a sibling block
  becomes a number. `checklist-checked` counts ticked todo items,
  `checklist-total` all items, `table-rows` counts table rows.

- **The derivation seam — a host-provided React context**
  (`src/lib/modules/sibling-context.tsx`, `SiblingBlocksProvider` /
  `useSiblingBlocks`). Module views receive only their own `data` by contract
  (t12 `ModuleViewProps`), deliberately — a module never reaches into another's
  internals. Rather than widen every view's props for a metric-only concern, the
  **host that lays out a page's blocks provides the sibling set + a
  `scrollToBlock`**, mirroring exactly how `editable` is host-passed rather than
  declared on the descriptor. Two hosts provide it: `DocumentPanel` (keyed off
  its live `blocks` state, so a checklist toggle re-derives every metric in the
  same render) and `PageView` (the recursive container, off `data.blocks`). A
  metric rendered outside a page host (Storybook, AI-terminal reference render)
  reads an empty list and degrades gracefully — never crashes. The registry
  contract is untouched: the seam is host-provided context, not a new required
  prop.

- **The `→` affordance is no longer dead** (`metric/view.tsx`). Bound → a `→`
  button that scrolls to and briefly highlights the source block (hosts own the
  `block-<id>` DOM ids, so hosts own the scroll). Unbound → no affordance at all
  (no dead control).

- **Stale binding never crashes.** Source deleted, missing, or the wrong type for
  the `kind` → `state: 'stale'`, falls back to the manual `value` with a subtle
  "source missing" note.

- **AI catalog auto-picks-up the binding** (verified). `moduleDataSchema`
  (`ai-composition.ts`) derives the metric's emit shape from `metricSchema.omit({
id: true })`; `source` carries no minted id, so it flows through with zero edits
  there. The metric descriptor's NL `description` was extended so the model knows
  it can bind a metric to a checklist/table — tested in `ai-composition.test.ts`.

- **Serialize derives too** (code-review fix). The `serialize`/`preview` facets
  gained an optional `siblings?: readonly unknown[]` second parameter (typed
  loosely in `types.ts` to stay out of the types↔content import cycle; a module
  that cares narrows it). Context assembly (`blocksToText`, `blockPreview`)
  passes each block's page-mates, so a bound metric's prompt/embedding text
  carries the SAME derived number the UI shows — the AI and the user can never
  see different values. A caller without the page in hand omits `siblings` and
  the metric then states the binding + manual fallback ("derived live from block
  X (manual fallback: N)") rather than guessing a number. Stale-with-siblings
  serializes the manual value explicitly flagged as "bound source missing".

- **One block-DOM convention** (code-review fix). `src/lib/modules/block-dom.ts`
  is the single place the `block-<id>` element-id convention is minted
  (`blockDomId`) and the one shared `scrollToBlock(blockId, { highlight })`
  helper — used by both hosts (DocumentPanel, PageView), so scroll+highlight
  behavior is identical everywhere. (AITerminal still inlines the string; that
  file is owned by another ticket — fold it in when it's next open.)

### Same-batch vs existing-blocks boundary (decision)

**Bindings apply to EXISTING blocks only.** The AI mints no ids; the client mints
block ids on accept (t16 branch 2). A block created in the same `changes[]` batch
therefore has no id at emit time, so a metric in that same batch cannot reference
it. Rather than do contract surgery (a symbolic-ref/placeholder-id scheme through
the whole hydrate/accept path), the boundary is drawn cleanly and the model is
**told the boundary in the descriptor description**: bind only to a block from the
injected context; to bind to a checklist/table you're also creating, create it
first and add the bound metric in a follow-up turn (once its id exists). This
keeps ticket-23 inside the metric module + minimal registry wiring, with no change
to the create/anchor/id-minting machinery.

### Validation

`npm run typecheck` clean. `npm test` → 30 suites / 282 tests pass (added
`metric-derive.test.ts` — checked/total/table-rows counts, live recompute, and
both stale fallbacks; binding assertions in `ai-composition.test.ts`; bound-metric
serialize coverage in `module-serialize.test.ts` + a `blocksToText` integration
check in `context-assemble.test.ts`).
Metric Storybook story tests pass (Unbound, BoundLive with a live checkbox toggle,
StaleSource). `npm run lint` has 80 pre-existing problems, all in
`src/components/charts/` (Bklit lib) and `src/app/proto/` — identical count on
`main`; every file this ticket touched lints clean.

### Deferred

- **Table column-filter bindings** (e.g. count table rows where `Status = Read`).
  Only `table-rows` (total row count) shipped; a predicate over a column is the
  natural next `kind` but needs a column/value selector in the schema and picker.
- **Same-batch binding** — ~~see the boundary above; would need a symbolic-ref
  scheme resolved at accept-time hydrate.~~ **CLOSED by ticket-31 (2026-08-28)**:
  a `create` op may carry a batch-local `key`, a metric's `source` may name it via
  `{ ref, kind }`, and `applyProposedChanges` resolves ref→minted-id in a single
  accept-time pass (unknown ref → binding dropped, metric falls back manual). What
  persists is always the `{ blockId, kind }` form, so the serialize honesty above
  is untouched.
- **Authoring discipline** (teach the AI one-canonical-structure-per-fact) is
  complementary and still worth folding into the catalog/prompt work; bindings
  make the redundant-representation case survivable, discipline would avoid it.
- **`metric-ring` binding** — the same `source` seam would suit a ring's fill
  fraction (derive `pct` from checked/total), left for when a real case lands.
