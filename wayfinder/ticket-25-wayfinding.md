---
id: 25
label: ux-audit:finding
status: open
blocked-by: []
blocks: []
---

# No "you are here" — breadcrumb, rail path, and honest counts

## Problem

Three levels deep (Life → Health → Workout Routines → 3-Day routine) the shell
gives no orientation:

- **No breadcrumb** — the header shows only the current node's title.
- **Rail doesn't follow you**: navigating via overview cards leaves the rail
  fully collapsed with no highlight on the path (selection highlight exists —
  it appeared for a root-level page — but ancestors never auto-expand).
  A page created via chat also isn't revealed in the rail.
- **Counts lie a little**: "11 pages across your life" counts the 5 areas
  themselves while the cards below sum to 6; Health's card says "2 pages
  inside" (all descendants) but its overview shows one card (direct children).
  Two different counting rules on one screen.

## Direction (not yet designed)

- Breadcrumb in the surface header (Life › Health › Workout Routines),
  clickable, replacing the bare title label on non-root surfaces.
- Rail auto-expands + highlights the path to the current node; creating a page
  (chat or ＋) reveals it.
- Pick one counting rule — likely: count content pages only, phrase nesting
  explicitly ("1 page · 1 nested") where it matters. Update FocalNumeral copy
  ("pages across your life") to match whatever rule wins.

## Build notes

`Rail` + `OverviewSurface` organisms, breadcrumb likely a new molecule
(Storybook story + story test; atoms/molecules/organisms only, per front-end
workflow).

## Origin

Hands-on UX audit, 2026-08-27 (`~/ux-01-life-overview.png`, `~/ux-02-leaf-page.png`).
