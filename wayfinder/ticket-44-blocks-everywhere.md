---
id: 44
label: cycle-4:authoring
status: open
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
