# Spec: #19 slice 5 — `configure_view` (the AI view-selection surface)

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Branch:** `feat/19-views` (continue on it; slices 1–4 committed, not pushed).
**Brief:** `wayfinder/BUILD-BRIEF-database-primitive.md` · **Prior handoff:** `wayfinder/HANDOFF-19-views-slice4.md`
**Status:** SPECCED — grilled 2026-09-02, all decisions user-confirmed. Ready to build.

## What this slice is (and the reframe that renamed it)

The grill killed the "create_view" framing. Nothing here creates a new _kind_ of view — the four
renderers (table/board/calendar/gallery) already exist (slices 3–4). The user only ever **selects
which existing layout** applies to a collection's rows, plus a few knobs (group-by, sort, filter).

So the tool is a **name-keyed upsert of the single view on a collection**, surfaced through a
lightweight proposal card. It is called **`configure_view`**.

This also resolves the brief's decision-20-vs-21 fork: it's the dedicated, `add_row`-style
name-keyed tool (dec. 21), **not** a raw view block emitted through `propose_changes` (dec. 20) —
because view config points at properties the model only knows by name.

## The ten resolved decisions

1. **Not "create" — select/configure.** The renderers exist; the user picks a layout + knobs. Renamed `create_view` → `configure_view`.
2. **One view per collection, re-selectable (model A).** A collection shows _one_ layout; "show as board" changes that view in place. No Notion-style view tabs / switcher, no "active view" state. (Multiple stacked view blocks remain physically possible but are not what this tool produces.)
3. **Proposal card, not optimistic.** View-select is Pond-initiated → rides a lightweight proposal card through the ticket-19 `{messages, resolutions}` envelope (consistent with dec. 17/22). The card shows the _resolved_ config so the user can catch a wrong group-by before accept.
4. **Upsert target resolution** (client, on the collection named by id):
   - 0 view blocks → mint one.
   - 1 view block → reconfigure it in place.
   - 2+ view blocks → reconfigure the **top-most**; leave the rest. (Edge from manual palette inserts; deterministic beats asking.)
   - **Not a collection** (no `_schema`, no `type='row'` children) → the tool **refuses at the model layer** (description requires an existing schema, like `add_row`); Pond routes to `define_schema` first. No silent view over nothing.
   - Targeting: model names the collection by **id from the [Workspace outline]**; the card lets the user correct the target before accept.
5. **Name→id resolution, lenient, with one forced field:**
   - Model supplies, by **name** (never id): `mode` (required enum), `groupBy` (property name), `sort` (name + dir), `filter` (name + op + value).
   - Client resolves each name→id against the collection's `_schema` on accept; a select/status `filter.value` resolves option **label**→id (same coercion `add_row` uses; note `apply.ts` filter matching already tolerates label-or-id at render).
   - **Lenient-drop:** an unresolved property/option drops _that clause_, keeps the rest, still applies the mode. **No repair loop** for resolution failures (a mis-config self-heals into a calm renderer notice, it never produces a bad artifact).
   - **Board group-by is FORCED at the schema layer:** `mode==='board'` ⇒ `groupBy` required on the tool input (`.superRefine` → `repairToolCall` re-asks the model). The client never infers a board's group-by behind the user's back. (Calendar's date is still client-picked via the existing `pickDateDef`; table/gallery need no config.)
   - Card renders the **resolved** config ("Board · grouped by **Status** · sorted by **Due** ↑"), so a dropped clause is visible pre-accept.
6. **Surface the collection schema in context (new, unavoidable scope).** Today the schema is _nowhere_ in the model's context: `fetchNodeContext` fetches only `type,title,blocks`; the outline is titles-only. The model therefore cannot name a valid group-by. Fix, scoped to the **open + @mentioned** page (model A): `fetchNodeContext` also reads `props`; a formatter renders the collection's property list (`Status: status · Due: date · Priority: select`) into that page's context block. **Bonus:** this retroactively makes `add_row`/`define_schema`'s "use the names shown in the schema" prompt claim _actually true_ (it's the same one change, so it's included, not extra). Distant-collection configuration (a collection you're not viewing) is out of scope — deferred to a later outline-annotation or `read_schema` tool.
7. **Config depth = full single-clause set now.** Expose `mode` + `groupBy` + `sort` (single key) + `filter` (single clause, ops `eq/neq/contains/gt/lt`). Renderers already apply all of it via `apply.ts`. Compound AND/OR stays deferred (dec. 15).
8. **Name = `configure_view`.** Signals configure/select, not creation; routes distinctly from `create_page`/`add_row`/`define_schema`/`propose_changes`.
9. **Separate cards, sequential, envelope unchanged (model A).** `configure_view` is its own card. It does **not** composite-batch with `define_schema` — and can't, since the view can't resolve "Status"→id until the schema is accepted. "Make my tasks a board grouped by status" on a bare page → a `define_schema` card, then a `configure_view` card; accepting the first makes the property exist for the second. No new envelope machinery.
10. **Scope + verification.**
    - Slice 6 (retire `kanban`/`table` from palette, dec. 23) stays **out** of this slice.
    - This is the **first live-verifiable AI path**. Verify = the usual gates + a routing-eval case + a real browser `/verify` against Supabase (chat → `configure_view` card → accept → board renders live).

## Build plan (files)

**Tool definition — `src/app/api/chat/tools.ts`**

- Add `configureViewInput` (zod) + `configureViewTool`, mirroring `defineSchemaTool`/`addRowTool`:
  - `pageId: string` (collection id, verbatim from outline).
  - `mode: viewModeSchema` (reuse the enum from `view/schema.ts`).
  - `groupBy?: string` (property **name**), `sort?: { key: string /*name*/, dir: 'asc'|'desc' }`, `filter?: { property: string /*name*/, op: filterOpSchema, value: string }`.
  - `reason?: string`.
  - `.superRefine`: `mode==='board'` ⇒ `groupBy` present (message names the fix, drives `repairToolCall`).
- Export as client-resolved (no `execute`), like the other three.

**Route wiring — `src/app/api/chat/route.ts`**

- Register `configure_view: tool(configureViewTool)` alongside `define_schema`/`add_row`.

**Prompt — `src/app/api/chat/prompt.ts`**

- Add a `configure_view` routing paragraph: when the user asks to show/display/format a collection's items _as_ a table/board/calendar/gallery (optionally grouped/sorted/filtered), call `configure_view`; name the collection by id; name group-by/sort/filter by property NAME from the schema shown in context; a board **requires** a group-by; DISTINCT from `propose_changes` (content blocks), `define_schema` (columns), `add_row` (items).

**Schema in context — `src/lib/context/assemble.ts`**

- `fetchNodeContext`: add `props` to the `.select(...)`.
- New pure formatter (e.g. `formatSchemaLine(props)`) → `Status: status · Due: date · …` from `props._schema`; empty when the page carries no `_schema`.
- `formatNodeContext`: append the schema line for a collection page (open + @mentioned paths both flow through it).

**Accept path — new molecule `src/components/molecules/ConfigureViewProposalCard.tsx`**

- Mirror `AddRowProposalCard`/`DefineSchemaProposalCard`: render the proposed mode + resolved knobs; accept/reject; on accept resolve names→ids against the target's `_schema`, upsert the view block per decision 4, write. Correctable target (collection picker) like `add_row`'s save-picker.
- Reuse the existing name→id + label→option-id resolution helpers from the add_row path; do not duplicate.

**Terminal wiring — `src/components/organisms/AITerminal.tsx`**

- Render the new card for a `configure_view` tool call; persist the decision in the `{messages, resolutions}` envelope; re-seed inert on reload; stamp a synthetic tool result on accept so the model stops re-proposing (identical to the shipped cards — ticket-19).

## Tests & gates (each commits green)

- **`apply.ts`** — already covered (22→29 in slice 4); no new math. If a resolution helper lands here, unit-test it.
- **`configure-view-from-proposal.test.ts`** (new, mirror `add-row-from-proposal.test.ts`): name→id resolution for groupBy/sort/filter; label→option-id for a select/status filter value; upsert semantics (0/1/2+ view blocks); lenient-drop of an unresolved clause; board-missing-groupBy is rejected at the schema layer.
- **`configure-view-flow-ui.test.tsx`** (new, mirror `add-row-flow-ui.test.tsx`): card renders resolved config; accept writes; reject no-ops; target-correction.
- **Context** — extend `context-assemble.test.ts` / `prompt-sections.test.ts`: schema line rendered for a collection page; absent for a non-collection; add_row/define_schema now see real schema names.
- **Routing eval** — add a `configure_view` case to `scripts/eval-routing.mts` (show-as-board vs add-a-row vs edit-blocks vs define-columns disambiguation).
- **Envelope** — extend `conversation-resolutions.test.ts` for the new card's resolution round-trip (inert re-seed + synthetic stamp).
- **Gates:** `npx tsc --noEmit` · `npx eslint <files>` · `npx jest` · `npx vitest --project=storybook run <stories>`.
- **Live `/verify`:** with Supabase live (`ifhahsvgqedvygpdeaix`; restore via mgmt API if auto-paused — token in keychain "Supabase CLI", ~4 min), drive chat → "show my tasks as a board grouped by status" → accept card → confirm the board renders grouped, then a sort/filter variant.

## Gotchas (carried from the brief + surfaced in the grill)

- **Don't clobber `_schema`.** The view block is config-only and lives in the page's `blocks`, not `props` — but if any write touches `props`, merge, never overwrite (`_schema` shares that JSON).
- **`serialize` stays sync.** No change to the hydration contract; `configure_view` only writes a block, the existing `assemble.ts` seam hydrates its rows on read.
- **Board group-by must resolve to a select/status.** The `.superRefine` forces _presence_; the client should prefer resolving the named group-by to a select/status property. If it resolves to a wrong-typed or unknown property → lenient-drop → renderer shows its "needs a group-by" notice (no crash).
- **Linked views stay stubbed.** `configure_view` sets no `collectionId`; inline-only this cycle.
- **Optimistic writes untouched.** This is the Pond-initiated (card) path; user drag/cell-edit stays optimistic and does not route here.

## Deferred (explicitly not this slice)

- Slice 6: retire `kanban`/`table` from palette (keep descriptors for read-tolerance; update exhaustiveness/palette tests).
- Distant-collection configuration (outline schema annotation or `read_schema` tool).
- Composite schema+view batching in one card.
- View switcher / multiple named views with tabs.
- Compound (AND/OR) filters.
- Consolidation #2 (unify `Cell` view.tsx vs `PropertyField` PropertyInspector.tsx) — carried code-review debt.
