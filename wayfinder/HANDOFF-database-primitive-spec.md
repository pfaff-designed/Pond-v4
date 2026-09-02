# Handoff: Database Primitive epic (#16–20) — GRILLED + SPECCED, ready to build

**Session date:** 2026-09-01
**What happened:** full `/grill-me` of the Database Primitive crown epic. Every branch resolved, user-confirmed. **No code written** — this was a plan-and-spec session. Next session builds #17.
**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` · branch `main` (clean, nothing committed this session — all artifacts are the brief + GitHub issue edits).

## Artifacts produced (all durable)

- **`wayfinder/BUILD-BRIEF-database-primitive.md`** — the authoritative decision record. Read this first.
- **Issues #17–20** — each has (a) a resolved-decisions comment and (b) a "Build checklist (from grill)" appended to its body. Each issue = one grabbable slice.
- **`wayfinder/ROADMAP-notion-parity.md` §3** — original epic source (unchanged).

## The one-paragraph mental model

A **database = an ordinary page whose `type='row'` children share a schema.** A **view = an inline block that draws those rows.** Keep the current **two-store spine** (page has a `blocks` JSON body **and** a child-page zone) — this is **Option 3**; the all-rows rewrite (Option 1) was rejected as a non-sliceable spine rewrite (27 `.blocks` sites + full-state-emit spine + one-way data migration) that buys only prose/row interleaving. The opening fork ("kanban: view or block?") resolved to **view over a collection**, unlocked by deciding **a card is a `'row'` page** (lightweight, rail-hidden, but a real openable page).

## Decisions (condensed — full detail in the brief)

- **#17 properties:** values in existing dormant `props` JSON; schema at `props._schema` on the collection (reserved key, no new column). 7 types: text/number/date/select/status/checkbox/relation (`relation` defined here, built in #20). Legacy live `status` column folds into `props`. Lone-page props are free-form until the page is a collection row.
- **#18 collections:** a page IS a collection iff it has `props._schema`. **Mixed children** — `type='row'` (schema-bound, in views, rail-hidden) vs ordinary sub-pages (rail-visible, not in views). New `'row'` NodeType; rail child-fetch (`client.ts:117`) filters it out. Lenient non-conforming (never deletes data).
- **#19 views (greenfield):** block `{ id, type:'view', mode, groupBy?, sort?, filter?, collectionId? }`. **Inline-only this cycle** (renders own page's rows); `collectionId` round-trips but **linked-view path is stubbed/guarded**. **All 4 modes** (table/board/calendar/gallery), multiple per collection. Config = single-clause filter + single-key sort + single groupBy (compound deferred). **Read-hydration seam:** inject rows before `serialize` in `assemble.ts` — **`serialize` stays sync** (don't make it async). User drag/cell-edit → optimistic `set_property`, **never** the AI path; Pond-initiated → proposal card.
- **#20 relations (data-model only):** `relation` = array of page-ids + optional `single` cap, **one-way** (reverse is a query). **Rollups/cycles/F14 fold-in DEFERRED to a dedicated #20-start grill.**
- **AI surface:** views authored via existing full-state-emit path; schema/rows/props via **new discrete tools** (`define_schema`, `add_row`, `set_property`, `create_view`) routed through the **proposal-card path** (ticket-19 `{messages,resolutions}` envelope), **batched one card per logical change**.
- **Retirement:** confirmed **nothing needs keeping** → `kanban` + `table` blocks retired (out of palette, kept registered for read-tolerance, optional one-shot cleanup). **Zero data migration anywhere.**

## Build order

**#17 → #18 → #19**, then **#20's `relation` type only**. #17 is the clean start — `props` is a dormant column (only ever written `{}`), so it's greenfield with no migration.

## Gotchas the builder must respect

- **Never clobber `_schema`** — row-value writes hit the same `props` object that holds `_schema` on collection pages. Merge.
- **`serialize` stays sync** — hydrate view blocks with their rows _before_ serialize (in `assemble.ts`, which already `fetchChildren`), don't make the descriptor async (breaks the `types.ts` pure-function contract).
- **Optimistic writes bypass the AI path** — user manipulation must not route through `propose_changes`.
- **`'row'` pages are real pages** — openable, own blocks + props; only rail-filtered. Not a lesser type.
- **Linked views stubbed, not absent** — `collectionId` must persist/round-trip; only foreign-child hydration + dangle handling is unbuilt. Guard explicitly.
- **Exhaustiveness tests** — retiring kanban/table keeps their descriptors registered but the `moduleDescriptors` palette/exhaustiveness tests need updating.
- **#20 must re-grill** before the rollup half — only the `relation` type is specced.

## Environment gotchas (carried forward)

- Supabase free-tier auto-pauses after ~1wk idle → NXDOMAIN on the project subdomain; restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (token in macOS keychain "Supabase CLI"), ~4 min. See `wayfinder/HANDOFF-caching-f26-ci.md`.
- Local dev: `DEV_AUTOLOGIN=1` on :3000 for /verify flows.

## To resume (paste into a fresh session)

> Building Pond-v4 Database Primitive #17 (page properties). Read `wayfinder/BUILD-BRIEF-database-primitive.md` and issue #17 first — the epic is fully grilled + specced, decisions are locked. Start with #17's checklist. Per `AGENTS.md`, #17–19 don't need re-grilling (already done); only #20's rollup half does.
