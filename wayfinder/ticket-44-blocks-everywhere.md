---
id: 44
label: cycle-4:authoring
status: resolved
blocked-by: []
blocks: []
---

# Manual block authoring everywhere: Life home + palette-first add (user findings)

Manual authoring (t37) shipped the `/` palette + `+` insert INSIDE the editor,
but the user can't add blocks on the **Life page** (no affordance at all) or
easily on **area pages** (a quiet text-first "+ Add content"). Two locked
decisions (user, cycle-4): **Life becomes a real home page that holds blocks**;
**adding is palette-first + always-visible**.

## 1. Life is a real home page (holds its own blocks)

Today the Life root is the synthetic workspace root (`!nodeId` →
`LifeOverviewPanel`), NOT a page row — so it can't hold blocks. Make Life able to
hold its OWN blocks, rendered ABOVE the "Everything within" areas grid (the same
composite pattern ticket-22 gave areas-with-content):

- Cleanest data approach (builder's call, document it): a persistent, reserved
  "Life" home page row (a well-known id / a `home` type) that holds blocks, OR a
  home-blocks store keyed to the root. It must NOT appear as a child in the rail
  or inflate the areas overview counts.
- `LifeOverviewPanel` becomes composite: Life's own blocks (full editor
  capability — the `/` palette, `+` insert, reorder, bound metrics via
  SiblingBlocksProvider) THEN the areas grid below. Empty Life shows just the
  overview + the add affordance (§3). Pond can compose Life's home blocks via the
  normal gate (it's a real page now — a pinned rollup metric, a welcome note).
- Preserve everything: the focal numeral / human-voice caption, the areas grid,
  breadcrumb, t42 chat column.

## 2. Area pages: adding opens the palette, not text-first

`AreaOverviewPanel`'s "+ Add content" currently calls `addTextBlock` (adds a
TEXT block, then you `/` for others). Change it to open the BLOCK PALETTE
directly (the SlashMenu module list from t37) — pick kanban/table/chart/metric/
text → inserts that module's empty state and flips to the composite editor.

## 3. Palette-first, always-visible add affordance (all editable pages)

A quiet but ALWAYS-VISIBLE "+ Add a block" affordance at the end of every
editable page (Life, areas, document pages) that opens the block palette
directly (not hover-only, not text-only). The existing hover `+` BETWEEN blocks
(t37) stays for mid-page insertion. One shared component; reuse the SlashMenu +
the registry-derived palette + `emptyBlockForType` (already covers kanban/charts
per the t38 integration). Replace the plain "+ Add text" foot button with this.

## Rules (token regime)

jest+story proof (Life-home composite render + empty state, area palette-open,
the always-visible add opening the palette + inserting each module's empty
state, Life-home blocks persist + don't leak into rail/counts). NO dev server —
orchestrator live-verifies (in the /sandbox once ticket-43 lands). Preserve all
shipped machinery (t22 composite, t37 slash/insert/reorder, t38 empty states,
t39 lifecycle, t42 column, bindings). Touched-files lint clean. Resolution +
status: resolved.

## Resolution

Shipped on `ticket-44` (3 commits). tsc clean · jest 58 suites / 791 tests ·
test-storybook 37 files / 170 tests · touched-files lint clean.

### The Life-home data approach (LOCKED decision 1)

Life is a REAL page now: a **reserved, per-user `home`-type row** — top-level
(`parent_id = null`), one per user, `title = 'Life'`, holding its own `blocks`.

- **Migration `0005_life_home_page.sql`** (additive + reversible): widens the
  `pages.type` CHECK to admit `home`, and adds a partial unique index
  `pages_one_home_per_user` (one home row per user; a create race fails cleanly,
  the loser re-reads the winner). No data moved.
- **`lib/pages/home.ts` · `getOrCreateHomePage`**: fetch-or-create, lazy on first
  Life view; idempotent under a race. Created empty (no seeded blocks), so an
  untouched Life shows just the overview + the add affordance.
- **No leak — ONE boundary.** `fetchPages` does a DB-side `.neq('type','home')`,
  so the `['pages']` cache the rail + overview + breadcrumb read never contains
  the home row: it can't become a rail child or inflate the areas overview. The
  home blocks are reached only through `home.ts` (a separate `['home']` query).
- **AI composes via the normal gate.** The home row IS surfaced in the AI
  workspace outline (`TYPE_LABEL.home = 'Home'`), so Pond targets it by id
  (`propose_changes` `targetPageId`) and the existing `writeAcceptedChanges` /
  `commitBlocks` tail writes to it — zero new AI plumbing. `LifeHomeCanvas`
  adopts that external write the way `DocumentPanel` does.
- The synthetic rail root (`LIFE_ID`) and `/workspace` (`?nodeId=null`) are
  UNCHANGED — Life still renders at the root URL; the home row backs its blocks.

### Palette-first + always-visible add (LOCKED decision 2)

- Shared `<BlockCanvas>` (extracted from DocumentPanel) is the ONE authoring body
  for Life, area pages, and document pages: `/` palette, hover `+` InsertBetween
  (t37, kept), reorder, bound metrics, delete+undo.
- New `AddBlockButton` (in the shared `BlockInserters` molecule): an
  always-visible, palette-first "+ Add a block" at the foot of every editable
  page, replacing the text-only "+ Add text".
- Area "+ Add content" opens the block palette directly; the pick inserts that
  module's empty state and flips to the composite editor.
- `paletteItems` + `emptyBlockForType` moved to `lib/modules/palette.ts` (still
  registry-derived — kanban/charts covered), imported by every surface.

### Tests added

`pages-home.test.ts` (get-or-create, idempotency, race, no-leak), 
`pages-tree-home-filter.test.ts` (fetchPages strips home), 
`life-home-composite.test.ts` (Life composite render + empty + always-visible add
opens palette + inserts each module empty state + persists to the home row),
updated `document-panel-blocks` (area palette-open) and the `OverviewSurface` +
new `BlockInserters` stories.
