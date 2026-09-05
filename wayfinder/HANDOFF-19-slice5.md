# Handoff: #19 slice 5 — `configure_view` BUILT + green, needs live /verify + commit

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Branch:** `feat/19-views` — slices 1–4 committed; **slice 5 is UNCOMMITTED working-tree changes** (green, not yet committed, not pushed).
**Spec:** `wayfinder/SPEC-19-slice5-configure-view.md` (10 grilled decisions). **Prior:** `HANDOFF-19-views-slice4.md`.

## What slice 5 is

`configure_view` — a name-keyed AI tool that SELECTS which existing renderer (table/board/calendar/gallery) draws a collection's rows, plus single-clause group-by/sort/filter. Not a "create" — the four renderers already exist (slices 3–4). Reconfigures the one view on a collection (upsert). Rides a proposal card through the ticket-19 `{messages,resolutions}` envelope, exactly like `add_row`.

## State: BUILT, all gates green

- tsc clean · eslint clean · **jest 978** (was 950) · storybook 208.
- **Not committed, not pushed. No live verify yet.**

## Files (all working-tree, uncommitted)

- `src/lib/pages/configure-view.ts` (NEW) — `resolveViewConfig` (name→id, label→option-id, lenient-drop), `upsertViewBlock` (0→mint / 1→reconfigure / 2+→top-most; omitted clause clears), `configureViewFromProposal` (throws if missing/not-a-collection).
- `src/lib/context/assemble.ts` — `fetchNodeContext` now selects `props`; `NodeContextData.schema`; `formatSchemaLine`; Properties line in `formatNodeContext`. **Also fixes the latent add_row/define_schema "names shown in schema" gap.**
- `src/app/api/chat/tools.ts` — `configureViewTool` + input schema; board `.superRefine` requires `groupBy`.
- `src/app/api/chat/route.ts` — registered `configure_view`.
- `src/app/api/chat/prompt.ts` — routing paragraph.
- `src/lib/conversation/proposals.ts` — `CONFIGURE_VIEW_TYPE`; `unresolvedProposalIds` viewDecisions param+branch.
- `src/lib/conversation/resolutions.ts` — `views` in type/empty/parse/guard + `tool-configure_view` stamping branch.
- `src/components/molecules/ConfigureViewProposalCard.tsx` (NEW) + `.stories.tsx` (NEW, 6 stories).
- `src/components/organisms/AITerminal.tsx` — `ConfigureViewPart`+guard; `viewDecisions`/`viewTarget` state; `views` in memo+deps; reset+load wiring; `unresolvedProposalIds` call; `acceptConfigureView` (invalidates `['pages']` AND `['page',id]`); render `.map` block.
- Tests: NEW `configure-view-from-proposal.test.ts`, `configure-view-flow-ui.test.tsx`; extended `context-assemble.test.ts`, `conversation-resolutions.test.ts`, `prompt-sections.test.ts`, `chat-route-body-guard.test.ts` (+`views:{}`).
- `scripts/eval-routing.impl.mts` — configure_view case added (NOT run — live-API eval).

## Slice-5 scope notes (from the grill)

- **One view per collection**, re-selectable (no switcher). 2+ view blocks → top-most reconfigured.
- **Schema-in-context is open/@mentioned page only** — configuring a _distant_ collection you're not viewing is out of scope (deferred). This is why decision 6 was the one genuinely new dependency.
- Board group-by is FORCED by the schema (repair loop); other clauses lenient-drop.
- Card previews the proposed config from tool input (names); true name→id resolution + drop happens on accept.

## NEXT (do in a fresh session)

1. **Live /verify** (the thing every prior slice deferred). Supabase `ifhahsvgqedvygpdeaix` may be auto-paused → restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in keychain "Supabase CLI", ~4 min). Then run the app, open a collection that has a Status(select/status) + a date prop, and in chat:
   - "show my tasks as a board grouped by status" → accept card → **board renders grouped**.
   - a sort variant ("sort by due date") and a filter variant ("show only the ones I'm still reading").
   - reload → card is inert, model doesn't re-propose.
2. **Commit** green (conventional): `feat(views): configure_view AI view-selection tool + schema-in-context (#19)`; keep local/unpushed per the slice-1–4 pattern, or push if desired.
3. Then **slice 6:** retire `kanban`/`table` from palette (keep descriptors for read-tolerance; update exhaustiveness/palette tests).

## Carried debt

- Consolidation #2: unify `Cell` (view.tsx) vs `PropertyField` (PropertyInspector.tsx).
- Gates: `npx tsc --noEmit` · `npx jest` · `npx eslint <files>` · `npx vitest --project=storybook run`.
