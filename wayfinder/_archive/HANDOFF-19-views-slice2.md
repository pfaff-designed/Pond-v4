# Handoff: #19 views — slices 1–2 shipped, slice 3 next (2026-09-02)

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Brief (grilled+specced, decisions 11–17):** `wayfinder/BUILD-BRIEF-database-primitive.md`

## Stack / PR state

- `main` → `feat/17-page-properties` (**PR #23**, pushed) → `feat/18-collections` (**PR #24**, pushed, tip `0b8173d` handoff) → **`feat/19-views`** (LOCAL, NOT pushed, no PR — too early at 2/6 slices).
- `feat/19-views` commits:
  - `8e3b8e9` — **slice 1** (the resolved open decision): select/status values resolve to option **id**, not label. `resolveOptionValue`/`optionForValue` in `properties/schema.ts`; `resolveRowValues` (create-page.ts) now does label→id with lenient raw fallback + idempotent-on-id. Read-side `optionForValue` has a legacy-label fallback (covers the one #18 verify-row).
  - `8dcc452` — **slice 2**: the `view` block + read-hydration seam.
- Gates green through slice 2: **tsc + eslint clean, jest 918**.

## What slice 2 built (context for slice 3)

- `src/lib/modules/view/schema.ts` — config-only `viewSchema` `{id,type:'view',mode('table'|'board'|'calendar'|'gallery'),groupBy?,sort?{key,dir},filter?{property,op,value},collectionId?}`. Exports `viewDescriptor`, `ViewRow`, `HydratedViewBlock`, `VIEW_MODES`, `FILTER_OPS`.
- `src/lib/modules/view/view.tsx` — **STUB `ViewView`** (shows "<Mode> view · rows render in a later slice"). **Slice 3 replaces this.**
- Registered in all 4 seams: `registry.ts`, `content.ts`, `renderers.tsx`, `ai-composition.ts` (+ `createPageBlockSchema`). The `ComposableFence` (module-exhaustiveness.test) FORCES view into `moduleDataSchema` — that's why it's AI-emittable (matches decision 20).
- **Read-hydration seam** = `hydrateViewBlocks` in `src/lib/context/assemble.ts`: inside `fetchNodeContext`, if any inline view (view block with no `collectionId`), fetch page's `type='row'` children via `getChildPages` and graft `rows:ViewRow[]` (id+title only) onto the view block BEFORE the sync `serialize`. This is the SERVER/embeddings path only.
- Held OUT of palette: `EXCLUDED_FROM_PALETTE = new Set(['page','view'])` in `palette.ts`.

## Slice 3 = TABLE + BOARD renderers (UI-heavy — full front-end workflow)

Follow the front-end workflow memory: atomic design (atoms/molecules/organisms) + Storybook + story tests + per-component Playwright + `/code-review`. Research reference patterns via **Mobbin MCP** first.

Scope (brief decision 13, 17):

1. **Replace the stub `ViewView`** with a real renderer dispatching on `data.mode` (table + board this slice; calendar+gallery = slice 4, keep a graceful fallback).
2. **Rows are NOT in the block** (config only). The client renderer must fetch this page's `type='row'` children itself. **GOTCHA (from #18 live verify):** do NOT reuse the lean rail key `['pages',workspace]` (no props) — use a props-full key like `['pages',workspace,'full']` or a dedicated `['rows',pageId]`, else RQ serves a props-less shape and every collection read looks empty.
3. **Rendering cells + group-by needs the collection schema** — the page's own `props._schema` via `readSchema(props)`. Resolve each row's stored value with `optionForValue(def, value)` for select/status chips (label+color); it already handles the id-or-legacy-label cases (slice 1).
4. **Board group-by** = bucket rows by the `groupBy` property id's option; one column per option (+ an "empty" bucket). **Table** = columns from schema property names, cells from resolved values.
5. **filter/sort/groupBy application** = write a PURE helper (e.g. `view/apply.ts`) so it's unit-testable and reused by all modes. Single-clause only (decision 15).
6. **Optimistic user writes bypass the AI** (decision 17): drag card / edit cell → optimistic `set_property(rowPageId, key, value)` then persist. NOTE: `set_property` is marked "planned" in #17 comments — the merge helper `withValue(props,key,value)` EXISTS in schema.ts; wire the actual page-update client call (check `pages/client.ts` for an update fn) or add a thin `setProperty`. Do NOT route these through `propose_changes`.
7. **Palette**: remove `'view'` from `EXCLUDED_FROM_PALETTE` + add a `view` case to `emptyBlockForType` in `palette.ts` (e.g. `{id,type:'view',mode:'table'}`), and add the `emptyBlockForType` guard test if present.
8. **Live-verify** the whole path (this is where #18 found bugs mocks missed): create/open a collection, confirm a real view renders rows, group-by works, an edit persists. Test collection: **"Ceramics Studio Plan"** (`84b7c60c-30a4-4fd4-af90-d68722a81761`) — has a `_schema` + rows. `DEV_AUTOLOGIN=1` on :3000.

## Remaining after slice 3

- **Slice 4**: calendar + gallery renderers.
- **Slice 5**: `create_view` AI tool (proposal-card path, ticket-19 envelope; single-clause config). Reconcile decision 20 (views via full-state-emit — already true) vs 21 (dedicated create_view) — create_view is the ergonomic authoring affordance on top.
- **Slice 6**: retire `kanban`/`table` from palette (keep descriptors registered for read-tolerance); update exhaustiveness/palette tests.

## Env

- Supabase project `ifhahsvgqedvygpdeaix`; free-tier auto-pauses ~1wk idle → NXDOMAIN; restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in macOS keychain "Supabase CLI"), ~4 min.
- Gates before each commit: `npm run typecheck`, `npx jest`, `npx eslint <files>`. lint-staged runs prettier + tsc on commit.
