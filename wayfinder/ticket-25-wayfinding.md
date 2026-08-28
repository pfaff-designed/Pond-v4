---
id: 25
label: ux-audit:finding
status: resolved
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

## Resolution (2026-08-27)

Built on ticket-22/24/27 without regressing them. Three parts:

**1. Breadcrumb (new molecule).** `src/components/molecules/Breadcrumb.tsx`
(+ story + story test) — `Life › Health › Workout Routines`, every ancestor a
click target, `Life` navigates home. Path derived from the parent_id chain via
a new pure `ancestorPath(rows, nodeId)` in `lib/pages/overview.ts` (returns the
chain root→parent, cycle-guarded). Integrated two ways:

- **Overview surfaces** (Life root + area): breadcrumb replaces the bare
  kicker label; the current node is the non-clickable tail. Life reads just
  "Life". `OverviewSurface` gained optional `crumbs`/`onNavigateCrumb`/`current`
  props (plain-kicker fallback keeps the existing story green). New shared
  `useNavigateCrumb(rows)` hook resolves a crumb id → the same URL params a
  rail click emits.
- **Editor header** (`DocumentPanel`): breadcrumb shows only the ANCESTOR path
  above the title; the editable title input stays the tail, so no duplication.

**2. Rail follows you.** `Rail` gained a selection-reactive reveal effect: when
`?nodeId` changes — via rail click, overview card, breadcrumb, OR a page created
through chat / ＋ — it auto-expands every folder on the path to the current node
(ancestors via `ancestorPath`) and the node highlights. Guarded by a
`revealedForRef` so a selection is revealed **once**; a later manual re-collapse
isn't fought (collapsing changes neither selection nor rows). Depends on `pages`
too, so a chat-created node (URL lands before the `['pages']` refetch) is
revealed as soon as its ancestors resolve. Scoped strictly to expand/highlight —
no touch to creation (ticket-26) or deletion (ticket-27) logic.

**3. One honest counting rule.** LOCKED: a **content page** = any node whose
`type !== 'area'`. Areas are the shell (the rail renders `type='area'` as a
folder); they organise content but aren't counted as "a page across your life".
Every headline number excludes areas; subtree walks still descend through nested
areas to count _their_ content. Where direct children and deeper descendants
differ, the phrase is explicit: `"2 pages · 1 nested"` (direct · nested-below);
when flat, `"N pages inside"`. Applied coherently to the Life focal, the area
overview focal, and every card stat/sub via rewritten `contentDescendants` /
`directContentChildren` derivations and a shared `insideLabel(direct, total)`.
Fixes both reported lies (Life counting the 5 areas; a card saying "2 pages
inside" while showing 1). Jest-covered in `overview-model.test.ts` (counting
rule, nested phrasing, singular captions, `ancestorPath`).

**Validation:** `npm run typecheck` clean; `npm test` 369 passed (35 suites);
`npm run test-storybook` 80 passed (20 files, incl. 4 new Breadcrumb stories);
eslint clean on all touched files.

### Review round (2026-08-28)

Code review found no blockers but two spec partials + cleanups, all addressed:

- **Rail path styling** — ancestors of the selection now carry a raised on-path
  tone (foreground for areas, body for leaves; `data-on-path` attr), calmer
  than the selected row's soft background, so the trail reads in the rail —
  not just the leaf. `pathIds` prop on `RailView`; `PathToSelection` story.
- **Focal captions get the nested split too** — the area (and Life) focal now
  uses the same direct·nested phrasing as the cards when they differ: Health
  with one card but two content pages reads focal `2` · "1 page · 1 nested
  within." — killing the focal-vs-cards ambiguity one level up as well.
- **Top-level-page residual, made honest** — a top-level content page counts 1
  in the Life focal but its card stat counts only what's INSIDE it (0 for a
  leaf), so card stats alone sum to less than the focal. The Life caption's
  split is what reconciles this: **"N pages · M nested across your life"**
  where N = top-level content pages (each its own card) and M = every content
  page inside a top-level card = exactly the sum of the card stats. Asserted
  by a dedicated reconciliation test (`nested = Σ card stats`). When all
  content is top-level the flat caption returns ("pages across your life.").
- Cleanups: one shared `workspaceUrl` nav helper (`lib/pages/nav.ts`) used by
  the rail, cards, and breadcrumb (was 3 copies); `Breadcrumb.onNavigate` now
  passes the whole `Crumb` (uses `Crumb.type`, no row re-lookup —
  `useNavigateCrumb()` needs no rows); fragile `replace('pages','page')`
  singularisation replaced with explicit singular/plural caption params;
  `CurrentIsNotClickable` story asserts `not.toHaveBeenCalled()`; misnamed
  "nested split" test replaced with a real nested-sub-area case (sub-area not
  counted, its content is).
