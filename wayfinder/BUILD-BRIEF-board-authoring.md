# BUILD BRIEF — Board authoring (manual collection + view modes)

**Status:** Slices 0–3 SHIPPED + live-verified (2026-09-08, uncommitted on `feat/issue-14`). Slice 4 remaining.
**Origin:** user report — "Kanban board doesn't work; there is no Kanban board I can create with `/`." Plus four editor bugs (below).
**Date:** 2026-09-08

## Progress (2026-09-08)

- **Slice 0 ✅** — SlashMenu dismiss (Escape / Backspace-on-empty / click-outside), Backspace-deletes-empty-block, ⠿/× alignment. Files: `SlashMenu.tsx`, `BlockCanvas.tsx`. Live-verified on Life home.
- **Slice 1 ✅** — `/board` palette preset + seed-on-insert. Files: `board-preset.ts` (new), `palette.ts`, `BlockCanvas.tsx`. Verified: `/board` on a fresh page seeds Status (To do/Doing/Done) → 3-column board.
- **Slice 2 ✅** — manual card CRUD. Files: `use-collection-rows.ts` (addRow/removeRow/renameRow), `view.tsx` (board + table: + Add card/row, inline title, delete). Verified: add/name/delete cards, correct columns, live counts, **persists across reload**. Polish: empty "No <status>" null bucket hidden.
- **Slice 3 ✅** — mode switcher + group-by picker (`ViewControls` in `view.tsx`, `ViewView` threads `onChange`→`onConfigChange`). Verified: Board↔Table↔Gantt on one dataset; gantt-without-dates shows calm notice; **mode persists across reload**.
- **Slice 4 ⬜ REMAINING** — manual column/schema editing (add/rename/reorder status columns, add a Date property to unlock Gantt/Timeline). Needs an `updateSchema` client writer + optimistic `['page', collectionId]` update; board column header edit affordances; an add-property control.

All: `tsc` clean, 0 console errors. Test page: "Board Test" (nodeId 18169a38-75ea-4e84-a8cc-5a017b03ea81) — a scratch page holding one board with a "Buy lumber" card; delete when done.

## The ask (user's words, resolved)

> "I expect to `/board` in the command picker and then from that board be able to change the view between Kanban, Timeline, Gantt chart, whatever. I also want to add tasks manually — edit these boards myself without AI. Also with AI if I choose. Freedom either way."

This is NOT the retired standalone `kanban` block (self-contained, single-mode, a data dead-end). It is the collection-backed **`view` block**, which already renders one dataset as Table / Board / Calendar / Gallery / Gantt. Everything needed exists; it is AI-only today. We add the **manual authoring layer** and a **`/board` entry point**.

## Locked decisions

1. **Page is the dataset.** The page hosting a board owns its tasks (its `type='row'` children + `_schema`). A second view (board or Gantt) on the SAME page shows the SAME tasks in another mode. No independent second board on one page — that's a new page. (Matches the `useCollectionRows` host-page model; row children are invisible to normal nav, so they don't pollute the page's real sub-pages.)
2. **Instant working board.** `/board` auto-seeds a `Status` property (`status` type: **To do / Doing / Done**) on the host page if it isn't already a collection, and groups the board by it → three empty columns on drop.
3. **Manual first, AI optional.** Every edit (add/rename/delete card, add/rename/reorder column, add row, switch mode, pick group-by) has a manual UI writing straight to the optimistic client writers, bypassing the AI (decision 17). The existing AI terminal path is untouched and remains available.

## Architecture notes (grounding)

- A **collection** = a page carrying `props._schema` (`src/lib/properties/schema.ts`: `isCollection`, `withSchema`, `SCHEMA_KEY`, `ROW_TYPE`).
- Its **rows** = `type='row'` child pages; fetched by `getCollectionRows`, cached at `['rows', collectionId]`.
- A **`view` block** is config-only (`mode`, `groupBy`, `startDate`, `endDate`, `collectionId?`); it draws the host page's rows (`ViewView` → `CollectionView` in `src/lib/modules/view/view.tsx`). `useCollectionRows` (`src/lib/modules/view/use-collection-rows.ts`) is the read/write seam; today it exposes only `setValue`.
- Client write primitives already exist in `src/lib/pages/client.ts`: `createPage` (mint a row child), `deletePage`, `updateTitle`, `setProperty`, `defineSchema`. The AI paths `promote-table.ts` / `configure-view.ts` / `addRowFromProposal` already compose these — the manual layer reuses the same primitives.
- `ModuleViewProps` already carries `onChange`; a `view` block can persist its own config edits (mode/groupBy) through it, saved by `BlockCanvas` → caller's debounced save. Plumbing exists; `ViewView` just ignores it today.

## Slices

### Slice 0 — Editor bug fixes (INDEPENDENT — ship first)

Unblocks the painful editor regardless of the board work.

- **Slash menu won't dismiss** (`src/components/molecules/SlashMenu.tsx`): add click-outside-to-close and Backspace-on-empty-filter-to-close; verify Escape actually reaches `onClose` live (it's wired at line 84 but user reports it failing — reproduce and fix root cause).
- **Backspace on an empty block deletes it** (`src/components/organisms/BlockCanvas.tsx` `BlockEditor`): Backspace at offset 0 in an empty block removes it and focuses the previous block's end.
- **Handle ⠿ / delete × misalignment** (`BlockCanvas.tsx:283–299`): align the two affordances (shared baseline/size; they sit at `-left-8`/`-left-5`, `top-1`, but the glyphs are optically off).
- **Acceptance:** all verified live in browser (Playwright) — menu dismisses three ways, empty block backspaces away, affordances line up.

### Slice 1 — `/board` creates a working board

- **Palette presets** (`src/lib/modules/palette.ts`): decouple a few palette items from raw module types. Add a **Board** preset (and optionally Table / Timeline / Calendar) that mints a `view` block in the corresponding `mode`. `emptyBlockForType`/insert path handles preset ids.
- **Seed-on-insert** (`BlockCanvas` insert path, which has `pageId`): when a board preset is inserted and the host page isn't a collection, `defineSchema` a `Status` (`status`) property with options To do / Doing / Done; set the view's `groupBy` to that property's id. (Async coordination: create schema → read status prop id → set `groupBy`.)
- **Acceptance:** on a plain page, `/board` → three empty columns titled TO DO / DOING / DONE, grouped by Status.

### Slice 2 — Manual card CRUD

- **Extend `useCollectionRows`** with `addRow(values)`, `removeRow(rowId)`, `renameRow(rowId, title)` — wrap `createPage`/`deletePage`/`updateTitle` + optimistic `['rows', collectionId]` cache updates (mirror `setValue`).
- **Board** (`CollectionBoard`): `+ Add card` at each column foot → new row with that column's status set; inline title edit on click; delete affordance. (Drag between columns already works.)
- **Table** (`CollectionTable`): `+ Add row`, inline title edit, delete row.
- **Acceptance:** add/rename/delete cards on a board and rows in a table, no AI, persists across reload.

### Slice 3 — Mode switcher + group-by picker

- A control row on the **editable** view block (in `CollectionView`/`ViewView`): mode control `Board · Table · Gantt · Calendar · Gallery` + a group-by dropdown (select/status properties) shown for board/calendar. Emits `onChange({...data, mode, groupBy})`.
- **Acceptance:** flip one board to Gantt/Table and back; same tasks, different mode; persists.

### Slice 4 — Manual column / schema editing

- **`updateSchema` client writer** + optimistic `['page', collectionId]` update.
- **Board columns:** add column (append status option), rename (edit option label), reorder.
- **Add-property affordance** for a Date property (unlocks Gantt/Timeline/Calendar honestly).
- **Acceptance:** add a "Blocked" column and a Start/End date yourself, then switch to Gantt and see bars.

## Risks / watch-items

- **Seed-on-insert async ordering** — `groupBy` must reference the REAL seeded property id, not a guess. Coordinate the schema write before finalizing the view block.
- **Two views, one page share `_schema`** — intended (locked decision 1); make sure adding a column in one view reflects in the other (shared `['page', collectionId]` cache — it will).
- **`row` children vs real sub-pages** — confirm `add card` creates `type='row'` (excluded from nav tree) so boards never litter the sidebar.
- **Supabase free-tier auto-pause** — if the project subdomain NXDOMAINs, restore via management API before live-verify (see project memory).

## Build order

Slice 0 first (independent quick win, live-verified). Then 1 → 2 → 3 → 4. Slices 1–3 deliver the core promise; slice 4 completes full manual authoring.
