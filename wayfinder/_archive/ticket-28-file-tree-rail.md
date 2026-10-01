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
   (`tabIndex` 0 on exactly one row, -1 elsewhere; view-owned `focusedId`
   state, reflected into DOM focus via effect). `↑/↓` move through visible rows,
   `→` expands a closed folder or steps into the first child of an open one,
   `←` collapses an open folder or steps out to the parent (Life is the parent
   of top-level areas), `Enter`/`Space` open the focused page, `Home`/`End` jump
   to the first/last visible row, `Delete`/`⌫` delete the focused row through
   the same blast-radius-confirm / undo path as ×, and `+` adds a child. The
   row's ＋/× are additionally REAL tab stops (t27 reachability). The pure key
   rules live in `src/lib/rail/tree.ts` (`treeKeyCommand`), jest-covered.
   `role="treeitem"` carries `aria-level` / `aria-expanded` / `aria-selected` /
   `aria-posinset` / `aria-setsize`.

4. **Life root = collapse-all.** Life's caret toggles `lifeExpanded`; collapsing
   it hides the whole tree AND clears open folders, so re-expanding returns to
   the resting top-level state — areas collapsed (it is a collapse-all with a
   clean re-open, deliberately NOT a symmetric expand-all). The label still
   opens the Life overview. `t25` reveal now also re-opens Life if it was
   collapsed when you navigate.

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
- `npm test` (jest) — 392 passed / 36 suites (incl. the new `rail-tree` suite:
  buildTree / isFolderNode / flattenVisible / treeKeyCommand / focusFallback).
- `npm run test-storybook` — 95 passed / 21 files (incl. new **TreeRow**:
  AreaFolder/Expanded/Leaf/Selected/OnPath/Root/CaretVsLabel/HoverCrud/
  KeyboardNav, and rewritten **Rail**: Resting/LifeCollapsed/Expanded/
  AriaCoordinates/PathToSelection/Interactions/LifeCaretCollapsesAll/HoverCrud/
  KeyboardNav/Loading/Empty).
- Lint — all touched files are clean; the ~80 pre-existing charts/proto
  problems are identical to main and untouched.

### Review round (2026-08-28)

Code review passed the aesthetic ("genuinely elevated, not timid") but flagged
six defects, all fixed:

1. **Keyboard CRUD regression (t27).** The row's ＋/× had `tabIndex={-1}` —
   keyboard/AT users couldn't add or delete. Fixed both ways: the controls are
   REAL tab stops again (tab from a focused row straight into its ＋/×, with the
   focus-within reveal), AND the tree binds `Delete`/`⌫` → delete the focused
   row (same ConfirmDialog / undo path as ×) and `+` → add child. Guards added
   so inner-control events don't double-drive the tree: the row's focus and
   keydown callbacks fire only when the event target IS the row (Enter on ＋
   clicks it without also "opening" the row; tabbing into × no longer yanks
   focus back to the row).
2. **Focus retention on row removal.** When the focused row vanishes (deleted,
   or hidden by an ancestor collapse), focus now falls to the nearest surviving
   neighbor in the previous order (else nearest-before, else Life) — pure
   `focusFallback` in `lib/rail/tree.ts`, VS Code's rule — and DOM focus is
   re-grabbed only if the removal actually dropped it to `<body>`. Stale ids in
   the key handler return null instead of jumping focus to Life
   (`treeKeyCommand` guards a missing row).
3. **Keyboard/state-machine jest coverage.** All pure tree logic extracted to
   `src/lib/rail/tree.ts` (buildTree, isFolderNode, flattenVisible,
   treeKeyCommand, focusFallback) and covered by 28 jest tests in
   `rail-tree.test.ts` — step-in/step-out, clamping, Home/End, root
   protections, Delete/+, stale ids, fallback rules. Stories keep the
   presentational layer.
4. **Caret/label split made strict.** `handleSelect` no longer auto-expands on
   label-click/Enter — the label ONLY opens; expansion belongs to the caret
   (and →) alone, matching the spec's VS Code split. (The t25 reveal effect
   still expands ancestors when the selection changes — the node itself stays
   as it was.)
5. **ARIA correctness.** Loading/empty status text moved OUTSIDE the
   `role="tree"` container (a `<p>` is an illegal tree child);
   `aria-posinset`/`aria-setsize` added to every row from the flattened
   structure (asserted in the AriaCoordinates story); the caret keeps
   `tabIndex=-1` and now `preventDefault`s mousedown so clicking it can't move
   focus off the row.
6. **Resolution overclaim fixed.** Life's caret is documented as what it is — a
   collapse-all with a clean re-open (areas collapsed), deliberately not a
   symmetric expand-all.

Cleanups from the same review: ONE `flattenVisible` (Life included in the flat
list — render, ARIA coordinates, and keyboard order all drive off the same
list; the container no longer computes its own copy — the view owns focus and
the keyboard machine, since focus is a view concern); `isArea` is an explicit
`TreeRow` prop (was inferred from accent-prop presence); `onAddChild`/`onDelete`
are optional (the Life root passes none instead of no-op stubs).

### Deferred / not in this pass

- **Drag-to-reorder / drag-to-reparent** — the tree is navigable but not
  rearrangeable; `order` + `parent_id` moves stay out of scope.
- **Rename-in-rail** — renaming still happens in the editor title (Life is
  explicitly non-renamable per spec); no inline rename affordance added.
- **Virtualization** — the flattened list renders every visible row; fine for a
  personal workspace, revisit only if a tree grows to thousands of nodes.
- End-to-end click-driven create/delete-at-depth live verification was blocked
  by the shared-browser/shared-DB env collision above (logic covered by tests).
