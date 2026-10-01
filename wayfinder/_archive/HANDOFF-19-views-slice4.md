# Handoff: #19 views — slice 4 shipped (calendar + gallery renderers), slice 5 next

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`
**Branch:** `feat/19-views` (slices 1–4 committed; **NOT pushed** — local only, as with slice 3).
**Brief:** `wayfinder/BUILD-BRIEF-database-primitive.md`; prior handoff `wayfinder/HANDOFF-19-views-slice3.md`.

## What slice 4 shipped

- **`src/lib/modules/view/apply.ts`** — two pure additions (decision 13, agenda layout per slice-4 grill):
  - `pickDateDef(schema, groupBy)` — the date property a calendar places by: the `groupBy`-named prop if it's a `date`, else the first `date` prop, else undefined.
  - `groupRowsByDate(rows, schema, dateById)` → `{ def, buckets: DateBucket[] }` — one lane per distinct `YYYY-MM-DD` (datetime buckets by its date part), chronological ascending, trailing undated bucket (`iso: null`). Returns null if the prop isn't a `date`. +7 tests (`apply.test.ts` 22 → 29).
- **`src/lib/modules/view/use-pointer-bucket-drag.ts`** (NEW) — the board's pointer-drag extracted to a shared hook the moment the calendar needed the same machinery. Hit-tests registered buckets by DOM rect, hands the consumer `(rowId, bucketKey)`; **drop-meaning stays per-consumer** (board writes an option id, calendar a date). Drag in refs, state only for lift visuals, `DRAG_THRESHOLD=4`. **Resolves deferred consolidation #1** from the slice-3 handoff.
- **`src/lib/modules/view/view.tsx`** —
  - `CollectionBoard` refactored onto `usePointerBucketDrag` (behaviour unchanged; the Chromium board-drag story still passes). Shared `NULL_BUCKET = '__none__'` sentinel.
  - **`CollectionCalendar`** — agenda: per-date `<section>` lanes (drop targets) + "No date" lane. Reschedule **two ways**: drag onto a lane (writes that lane's date; "No date" clears to null) OR the **inline date field** per card (reuses `Cell` in editable mode → reaches any date). `formatDateHeader` builds the header from date parts at _local_ midnight (no TZ day-drift). No date prop → `ViewNotice`.
  - **`CollectionGallery`** — read-only card grid (`auto-fill minmax(13rem,1fr)`); title over each schema prop rendered read-only via the shared `Cell`. No image type this cycle, so it's title + values. Empty → "No rows yet".
  - `CollectionView` dispatch: board / calendar / gallery / table (removed the "coming soon — showing as a table" fallback banner + `isFuture`).
- **`view.stories.tsx`** — +6 (9 → 15): `CalendarReadOnly`, `CalendarEditDate` (inline reschedule out of the No-date lane), `CalendarDragBetweenLanes` (Chromium pointer drag), `CalendarNeedsDate`, `GalleryReadOnly`, `GalleryEmpty`. Shared fixture gained a `p-due` date prop + dates on r1/r2/r3 (r4 stays undated) — existing table/board stories unaffected (they key off specific columns/titles).
- **`schema.ts`** — VIEW_MODES comment updated (calendar/gallery now landed).

## Slice-4 grill decisions (resolved with the user before building)

1. **Calendar layout = chronological agenda** (not a month grid) — "new but small" per brief.
2. **Date property = reuse the `groupBy` field** (fallback to first date prop). No schema change.
3. **Reschedule = BOTH** inline date field AND drag-between-lanes. (Drag alone can't reach a date with no existing rows; the inline field can — the user chose both.)
4. **Gallery = read-only.** Editing stays in the table.

## Gates + verification

- tsc clean · eslint clean · **jest 950** (was 943) · vitest storybook **15/15**.
- **No live app verify** — same as the board in slice 3: there's no UI to set `mode:'calendar'`/`gallery`/`groupBy` yet (that's slice 5's `create_view`). Interactions are proven by the **Chromium** storybook tests (real `getBoundingClientRect` hit-testing for drag; `fireEvent.change` for the inline date field). The shared fetch/write seam is already live-verified through the table path (slice 3).

## Code-review status (carried, not re-run this slice)

- **Deferred consolidation #1 (drag machinery)** — DONE (the shared hook).
- **Deferred consolidation #2 (repeated Switch)** — STILL OPEN: `Cell` (view.tsx) vs `PropertyField` (`PropertyInspector.tsx`) switch the same `def.type` axis. Candidate: a shared `<PropertyControl def value editable onChange variant>`; note Cell's legacy-tolerant select is the better version.
- Minor: `TOKEN_DOT` color map could move to a shared chip helper if another module renders option chips.

## Remaining

- **Slice 5:** `create_view` AI tool (proposal-card, ticket-19 `{messages,resolutions}` envelope; single-clause). First surface that lets users pick a mode/groupBy/sort/filter without hand-editing config. **Grill + spec first** (AGENTS.md) — must reconcile decision 20 (full-state block emit) vs 21 (dedicated `create_view` tool).
- **Slice 6:** retire `kanban`/`table` from the palette (keep descriptors registered for read-tolerance); update exhaustiveness/palette tests.
- **Then:** consolidation #2 above, if not folded into slice 5/6.

## Env

- Supabase `ifhahsvgqedvygpdeaix`; free-tier auto-pauses ~1wk → NXDOMAIN; restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in keychain "Supabase CLI"), ~4 min.
- Gates: `npx tsc --noEmit`, `npx jest`, `npx eslint <files>`, `npx vitest --project=storybook run <stories>`.
