# Handoff: #19 views — slice 3 shipped (table + board renderers), slice 4 next

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Branch:** `feat/19-views` (slices 1–3 local; **slice 3 NOT yet committed** — working tree only).
**Brief:** `wayfinder/BUILD-BRIEF-database-primitive.md`; prior handoff `wayfinder/HANDOFF-19-views-slice2.md`.

## What slice 3 shipped (all 8 brief points)

- **`src/lib/modules/view/apply.ts`** — pure single-clause filter/sort/group over `CollectionRow[]`+schema (decision 15). `filterRows`/`sortRows`/`applyView`/`groupRows`/`displayValue`. Choice values resolve via `optionForValue` (id-or-legacy-label). +`apply.test.ts` (22).
- **`src/lib/modules/view/use-collection-rows.ts`** — client hook. Schema from `['page',collectionId]`; rows from a **dedicated `['rows',collectionId]`** key (NOT the props-less, row-excluding `['pages',workspace]` — the #18 gotcha). `getCollectionRows` in `pages/client.ts` (getChildPages filtered to ROW_TYPE, full props). `setValue` = optimistic cache patch (rows + row's own `['page']`) then `setProperty`, **`.catch` → invalidate** to reconcile on write failure. Bypasses the AI (decision 17).
- **`src/lib/modules/view/view.tsx`** — stub replaced. `ViewView` (reads host `pageId` via `useSiblingBlocks`, inline-only) → presentational **`CollectionView`** (exported for stories) dispatching on `data.mode`: **`CollectionTable`** (Name col + schema cols, per-type inline `Cell` editors, chips) and **`CollectionBoard`** (option buckets + null bucket, pointer-drag ported from kanban → `onEdit(row, groupBy, optionId)`). calendar/gallery → table fallback with a note. Graceful notices: loading / no-schema / linked / no-valid-groupBy.
- **`view.stories.tsx`** (9 story tests, incl. board drag in Chromium + legacy-label guard) · **`__tests__/view-palette.test.ts`** (3).
- **`palette.ts`** — `view` removed from `EXCLUDED_FROM_PALETTE`; `emptyBlockForType('view')` → `{id,type:'view',mode:'table'}`.

## Gates + live-verify

- tsc clean · eslint clean · **jest 943** (was 918) · vitest storybook **9/9**.
- Live (Ceramics Studio Plan `84b7c60c-30a4-4fd4-af90-d68722a81761`, dev :3000): added a view via palette → table rendered the row with Name/Status/Priority/Due. **Bug found+fixed**: editable `<select>` bound the raw value, so the #18 legacy label `"Doing"` fell back to "—"; now `optionForValue(def,value)?.id` (guarded by `TableLegacyLabelValue` story). Edit Status Doing→Done **persisted across reload**; restored to Doing after. Row does NOT leak into the rail (ROW_TYPE filtered).
- **Board group-by + drag verified via the Chromium Storybook tests only** — there is no UI to set `mode:'board'`/`groupBy` yet (that's slice 5's `create_view`). The shared fetch/write seam IS live-verified through the table path.

## Code-review findings (2-axis) — status

- **Spec:** all 7 assessable reqs met. Fixed: fire-and-forget write now `.catch`-reconciles; dead `toPropertyValue` export deleted.
- **Standards:** no hard violations. **Deferred (judgement-call, would widen scope):**
  1. **Duplicated drag machinery** — `CollectionBoard` pointer-drag is a near-verbatim port of `kanban/view.tsx`. Candidate: extract a `usePointerColumnDrag` hook (consumers differ: kanban emits full-state `onChange`, board writes one prop via `onEdit`).
  2. **Repeated Switch** — `Cell` (view.tsx) vs `PropertyField` (`PropertyInspector.tsx`) switch on the same `def.type` axis. Candidate: a shared `<PropertyControl def value editable onChange variant>`; note Cell's legacy-tolerant select is the better version PropertyField lacks.
  3. Minor: inline `TOKEN_DOT` color-token map could move to a shared chip helper if another module renders option chips.

## Remaining

- **Slice 4:** calendar + gallery renderers (replace the table fallback in `CollectionView`).
- **Slice 5:** `create_view` AI tool (proposal-card, ticket-19 envelope; single-clause). This is what gives users a board/sort/filter/groupBy without hand-editing config. Reconcile decision 20 (full-state emit) vs 21 (dedicated create_view).
- **Slice 6:** retire `kanban`/`table` from palette (keep descriptors registered for read-tolerance); update exhaustiveness/palette tests.
- **First:** commit slice 3, then consider the two deferred consolidations above.

## Env

- Supabase `ifhahsvgqedvygpdeaix`; free-tier auto-pauses ~1wk → NXDOMAIN; restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in keychain "Supabase CLI"), ~4 min.
- Gates: `npx tsc --noEmit`, `npx jest`, `npx eslint <files>`, `npx vitest --project=storybook run <stories>`.
