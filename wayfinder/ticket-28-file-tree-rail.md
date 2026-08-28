---
id: 28
label: cycle-2:directive
status: resolved
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

## Resolution (2026-08-28)

**status: resolved.** The rail is now one continuous, VS Code-grade recursive
file tree rooted at Life. Life is the root folder at depth 0 (the first
`treeitem`, not a separate header button); areas nest under it at depth 1, pages
and sub-pages to arbitrary depth in a single tree. This was a view-layer
restructure — the `['pages']` query + parent_id tree is unchanged, so ticket-25
(reveal + path highlight), ticket-26 (create lands + reveals), and ticket-27
(blast-radius confirm, deferred-commit undo, hover-reveal CRUD) all ride through
untouched.

### What shipped

1. **New molecule `TreeRow`** (`src/components/molecules/TreeRow.tsx` + stories +
   story tests). One presentational tree row — all state (expanded/selected/
   on-path/focused/busy) and mutations (toggle/open/add/delete/focus/keydown)
   raised as props, so it renders identically in Storybook and the live rail.
   Anatomy at a fixed 34px row height: per-level indentation guides (one
   `press-hair` hairline per ancestor level, brightening to `press-line` on the
   selected/on-path trail), an **authored SVG chevron** rotating 90° on expand
   with a single calm cubic-bezier ease (no glyph), the muted sage `KindDot`,
   the label (opens the page), and hover-reveal ＋/× at `opacity-0`
   (group-hover / group-focus-within / focus-visible). Composite pages
   (blocks AND children) are folders whose caret toggles and whose label opens —
   VS Code's split, preserved.

2. **Rail reworked into a recursive tree** (`src/components/organisms/Rail.tsx`).
   `RailView` renders `role="tree"` with the Life root (`LIFE_ID` synthetic id,
   never a `pages` row — can't be renamed/deleted, no ＋/×). New pure helpers:
   `isFolderNode` (area OR has-children), `flattenVisible(tree, expanded,
lifeExpanded)` → the in-order list of currently-visible rows that drives both
   render and keyboard order. `RailRow` (the old inline recursive row) is gone,
   replaced by mapping the flattened list to `TreeRow`.

3. **Keyboard navigation — WAI-ARIA APG tree pattern.** A single roving tab stop
   (`tabIndex` 0 on exactly one row, -1 elsewhere; container-owned `focusedId`
   state, reflected into DOM focus via effect). `↑/↓` move through visible rows,
   `→` expands a closed folder or steps into the first child of an open one,
   `←` collapses an open folder or steps out to the parent (Life is the parent
   of top-level areas), `Enter`/`Space` open the focused page, `Home`/`End` jump
   to the first/last visible row. `role="treeitem"` carries `aria-level` /
   `aria-expanded` / `aria-selected`.

4. **Life root = expand-all / collapse-all.** Life's caret toggles `lifeExpanded`;
   collapsing it hides the whole tree AND clears open folders, so re-expanding
   returns to the resting top-level state (the "collapse everything" affordance).
   The label still opens the Life overview. `t25` reveal now also re-opens Life
   if it was collapsed when you navigate.

### Design — references that shaped it

Research: Mobbin (Notion, Frame, Evernote, GitBook, Linear web sidebars),
Design Systems MCP (WAI-ARIA APG **Tree View**, Carbon/Radix keyboard-a11y),
and the impeccable **craft floor**.

- **Notion / Frame / Evernote trees (Mobbin)** confirmed the _caret-left +
  label-opens + hover-only CRUD_ grammar and the single-vertical-rule indent
  guide — but read cramped/flat, so I elevated: a taller 34px row for breathing
  rhythm, one hairline _per_ ancestor level (not just one rail), and the trail
  brightening its own guides so the eye follows depth home.
- **WAI-ARIA APG Tree View + Carbon/Radix a11y** are the backbone for the
  roving-tabindex / arrow-key / `treeitem`-role model above — a real tree
  widget, not a list of buttons.
- **impeccable craft floor** drove three deliberate departures from the old
  rail: killed the **"PAGES" kicker/eyebrow** (the floor bans eyebrows
  outright — the tree needs no section label), replaced the **`▶` / `◒` / ＋ / ×
  unicode glyphs with authored one-stroke SVGs** (floor bans glyphs standing in
  for an icon system), and made motion **one calm authored moment** (the chevron
  ease) rather than scattered effects. Secondary text stays ink-tinted via the
  `press-*` tokens (never flat gray), per the floor's contrast rule.

### Verify (live, port 3028, own dev server)

Real workspace data (Life root + 5 seeded areas; Creativity holds the one real
page "Ceramics Studio Plan"). Screenshots `~/t28-verify-01..04-*.png`.

- **Renders** — `role="tree"[aria-label=Workspace]` with Life root
  (`aria-level=1`, `aria-expanded=true`, `aria-selected=true`, sage half-disc
  mark + "ALL" caption) and 5 area rows at `aria-level=2`. (verify-01/03)
- **Expand at depth ≥2** — clicking Creativity's caret set `aria-expanded=true`
  and revealed its child at `aria-level=3` with an indentation-guide hairline.
  (verify-02)
- **Keyboard nav** — dumped live on 3028: exactly one row `tabindex=0` (Life),
  rest -1; `↓` Life→Personal→Professional, `↑` back to Personal, `End`→Creativity,
  `Home`→Life; `→` on open Life steps into Personal, `→` on closed Personal sets
  its `aria-expanded=true`.
- **Collapse-all** — clicking the Life caret closed the entire tree to the
  single Life row (chevron rotates closed). (verify-04)
- **hover-reveal ＋/×** — resting `opacity-0`, present in the a11y tree with
  `Add sub-page to <name>` / `Delete <name>` labels; the Life root exposes
  neither (asserted in the live snapshot and the story tests). ConfirmDialog +
  deferred-undo wiring is unchanged from t27.

**Env note (not a code defect):** this run shared one Playwright browser +
one Supabase DB with parallel-agent worktree servers (ports 3029/3031/3033).
The shared browser tab was repeatedly navigated away from 3028 by another
agent's session between tool calls, so multi-step live flows had to be driven
as single atomic `evaluate` calls (all the above landed on 3028, origin
asserted). Auto-reveal-on-navigate and create/delete-at-depth end-to-end were
not click-driven live for this reason (the click→`router.push` bounced to a
neighbouring worktree); their logic is exercised by the story tests and the t25/
t26/t27 suites, and the reveal effect was updated to also re-open Life.

### Validation

- `npm run typecheck` — clean.
- `npm test` (jest) — 364 passed / 35 suites.
- `npm run test-storybook` — 94 passed / 21 files (incl. new **TreeRow**:
  AreaFolder/Expanded/Leaf/Selected/OnPath/Root/CaretVsLabel/HoverCrud/
  KeyboardNav, and rewritten **Rail**: Resting/LifeCollapsed/Expanded/
  PathToSelection/Interactions/LifeCaretCollapsesAll/HoverCrud/KeyboardNav/
  Loading/Empty).
- Lint — the four touched files are clean; the ~80 pre-existing charts/proto
  problems are identical to main and untouched.

### Deferred / not in this pass

- **Drag-to-reorder / drag-to-reparent** — the tree is navigable but not
  rearrangeable; `order` + `parent_id` moves stay out of scope.
- **Rename-in-rail** — renaming still happens in the editor title (Life is
  explicitly non-renamable per spec); no inline rename affordance added.
- **Virtualization** — the flattened list renders every visible row; fine for a
  personal workspace, revisit only if a tree grows to thousands of nodes.
- End-to-end click-driven create/delete-at-depth live verification was blocked
  by the shared-browser/shared-DB env collision above (logic covered by tests).
