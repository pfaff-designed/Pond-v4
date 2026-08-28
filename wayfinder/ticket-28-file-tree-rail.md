---
id: 28
label: cycle-2:directive
status: open
blocked-by: []
blocks: []
---

# Rail becomes a complete VS Code-style file tree rooted at Life

## Problem

User directive (2026-08-28). The current rail is a flat-ish list: five area rows
with disclosure carets, "Life" as a separate button above the tree. The user
wants a true file-explorer tree, VS Code-grade:

- **Life is the root folder** — the first node of the tree itself, not a
  separate header button. Everything nests under it: Life › area › page ›
  sub-page, arbitrary depth, one continuous tree.
- Full hierarchy always navigable: any node with children is a folder
  (disclosure caret), any leaf is a file. A page with BOTH blocks and children
  (composite, ticket-22) is a folder that is also openable as a document —
  VS Code solves this as caret-toggles-expand / label-click-opens; keep that
  split.
- Expected file-explorer behaviors to match (VS Code as reference bar):
  indentation guides, per-level indent, caret rotation, keyboard navigation
  (↑/↓ move, →/← expand-collapse/step-out, Enter opens), click-to-select,
  double-click safe. Auto-reveal of the current node (ticket-25) must keep
  working with Life as root.
- Existing affordances survive: hover-reveal + / × (ticket-27), path highlight
  (ticket-25), create lands per ticket-26.

## Direction

Rework `Rail`/`RailView` into a recursive tree component. Life is `depth 0`
(cannot be deleted or renamed from the rail; it is the workspace root, not a
row in `pages`). Areas render as its children. Keep the data source (`['pages']`
query + parent_id tree) unchanged — this is a view-layer restructure.

## Front-end rules (cycle 2 — binding)

- Research first: mobbin MCP (file-tree / sidebar navigation patterns in
  premium tools), Design Systems MCP knowledge, impeccable skill for the craft
  pass.
- AESTHETIC MANDATE: bolder than feels safe. The tree must read as premium,
  luxury, zen — Press aesthetic elevated (type, spacing, motion, indentation
  guides as hairlines, calm reveal animation), not a stock file explorer.
- Live Playwright verify pass required before merge (expand/collapse, keyboard
  nav, reveal-on-navigate, create/delete affordances at depth ≥3).
- Atomic design: tree row as molecule with stories + story tests; keyboard nav
  story-tested.

## Origin

User directive, cycle-2 kickoff (2026-08-28).
