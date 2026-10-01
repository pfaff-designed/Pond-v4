# Handoff: #18 collections shipped to branch (2026-09-02)

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`

## State

- **#17 page-properties:** live /verify PASSED, **PR #23 OPEN** (base `main`, closes #17, branch `feat/17-page-properties` pushed, tip `3e0cbd4`).
- **#18 collections:** BUILT + live /verify PASSED. Branch **`feat/18-collections`** STACKED on feat/17, **NOT pushed**. 2 commits:
  - `4bd2769` — `'row'` NodeType + `ROW_TYPE` (properties/schema.ts) + `fetchPages` filter (tree.ts, the ONE tree boundary, alongside HOME_TYPE) + TYPE_LABEL 'row' + tree-filter test.
  - `fa526c2` — `add_row` AI tool (13-seam mirror of `define_schema`): `resolveRowValues`+`addRowFromProposal` (create-page.ts), `AddRowProposalCard`(+stories), AITerminal wiring (`collectionOptions`, `rowDecisions`/`rowTarget`, `acceptAddRow`), `rows`+`ADD_ROW_TYPE` in the ticket-19 envelope, unit/UI/resolutions tests.
- Gates: tsc + eslint clean, **jest 893**, 7 storybook. Rows stay openable (getPage) + visible to getChildPages (#19 hydration), hidden from rail/overview.

## Two fixes found ONLY by live verify (mocked tests missed both)

1. **Query-key collision** — AITerminal `allPages` (listPages, WITH props) shared `['pages',workspace]` with rail `fetchPages` (lean, NO props); RQ served props-less shape → `isCollection(p.props)` always false → collection picker EMPTY. Re-keyed to `['pages',workspace,'full']` (prefix invalidation still refreshes it).
2. **Migration `0007_collection_rows.sql`** — Postgres `pages_type_check` didn't admit `'row'` → inserts 400'd. Widened (mirrors 0006 'home'), **APPLIED to linked DB** via mgmt API (token in keychain "Supabase CLI").

## Design defaults chosen (flagged for review)

- Single-row card (multi-row batching, decision-22, deferred).
- `add_row` props keyed by property NAME → resolved to ids on accept (model never mints ids).
- Only ONE new tool: ordinary sub-pages keep `create_page` (decisions 10/21).

## OPEN DECISION before #19

Select/status row values are stored as the **label string** (`"High"`, `"Doing"`), not the option id. Tolerated by #18 lenience, but #19 view chips/group-by may need label→id resolution. Decide at/before #19's grill.

## NEXT

1. Push `feat/18-collections` + open its PR (stacked on #23).
2. **#19 views** — grilled+specced in `wayfinder/BUILD-BRIEF-database-primitive.md` (4 render modes, inline read-hydration seam in assemble.ts, single-clause config, `create_view`, retire kanban/table from palette). Resolve the label-vs-id decision first.

## Env

- Supabase project `ifhahsvgqedvygpdeaix`; free-tier auto-pauses ~1wk idle → NXDOMAIN, restore via mgmt API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore`.
- Local dev: `DEV_AUTOLOGIN=1` on :3000. Test collection used in verify: "Ceramics Studio Plan" (`84b7c60c-30a4-4fd4-af90-d68722a81761`, now has a `_schema` + one row).
