# HANDOFF — v85 "Clearing" loaded (full-of-data life system)

_Written 2026-08-14, end of session 5. Standalone; the long history is in
`wayfinder/HANDOFF-r6-folio-patterns.md` (this file is the current-state summary)._

## TL;DR

`v85 Clearing` is the **only** proto. Over sessions 4–5 it became **what Pond looks like once it
holds Charles's whole life-management system**: five areas, each area is a page, filled with
believable deterministic data. Charles said we're **near the end of iterations**. **Everything is
UNCOMMITTED and `main` is not pushed.** `npx tsc --noEmit` = exit 0, dev load = 0 console errors.

## Run it

- Dev server: **http://localhost:3000/proto/visual-language** (may already be up).
- If it's down, from repo root `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`:
  `PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH node node_modules/next/dist/bin/next dev -p 3000`
  (Node 22 is the stable Turbopack path; standalone/seed scripts run on Node 24.)
- Proto is git-untracked history-wise but v85 IS git-tracked now (session 2). All of sessions 4–5 is
  uncommitted working tree.

## The product (current shape)

Layout is LOCKED: **left rail · top-right glass cluster · bottom AI bar.**

- **Rail = minimal, collapsible.** Top: a single **Life** button (the everything-overview = the
  `home`/Today surface). Then **Areas** as collapsible folders — a caret toggles the folder; the area
  **name opens that area's overview page**. All collapsed by default.
- **Five areas** (`data.ts` `tree`): **Health** [Marathon(reader)·Sleep·Workout] · **Professional**
  [Q3·Design System·Projects·Tasks] · **Finances** [Budget] · **Creativity** [Walnut Shelf·Wishlist] ·
  **Personal** [_Food›_ Recipes·Meal Plan·Groceries · My Trips · Contacts · Library · Journal].
  **Life = the shell**, not an area (the Today "across your life" read).
- **Each area IS a page** — the shared `pages/area-overview.tsx` (one component, keyed by `ctx.openId`,
  config in `data.ts` `AREA_OVERVIEW`): a focal Instrument-Serif numeral + a Pond read + a **card per
  child page** (each opens its dashboard) + a "ask Pond about {area} →" link.
- **Top-right cluster = icon-only**: `◔` Notifications (rust dot) · `＋` Capture · `⌘K` command palette.
  (The word "Ask" was removed to stop colliding with the bottom chat's "Ask".)
- **Bottom AI bar** = Talk-to-Pond chat (Send is the "Ask"). ⌘K palette = fuzzy nav (Life · the 5
  areas · every page) + free-text → "Ask Pond".
- **Read / Plan / Focus lenses were dropped from nav** this session (files kept on disk, just not in
  the rail or palette). The Today/Life surface still has an "Enter focus" affordance — left as-is (not
  in scope); trim if desired.

## Architecture (where things live)

`src/app/proto/visual-language/variants/v85-clearing/`

- `index.tsx` — the shell: rail (Life + collapsible area folders via `openAreas` Set / `toggleArea` /
  `openArea`), `MODULE_SURFACES` registry (id → dashboard component; the 5 area ids → `AreaOverview`),
  ⌘K palette, Capture, Notifications drawer (left-spine timeline, Accept applies `diffCard`), Ask chat,
  focus chrome-recede. `WHOLE_LIFE_ANSWER`/`pondReply` (canned cross-life reply).
- `data.ts` — single source of truth: `tree` (5 areas + nested Food), `MODULE_PAGES`/`isModulePage`,
  `AREA_TITLE`, **`AREA_OVERVIEW`** (per-area at-a-glance config), `DOCS` (title/crumb per leaf),
  recursive `PAGES`/`firstPageOf`, `DIGEST`/`SUGGESTION` (Today), `TRAY`/`WEEK_PLACED` (Plan),
  `ACTIVITY` (notifications, each has a `page` click target), `READER`+`AMBIENT_NOTES` (the marathon
  long-form for Read + its note-index), focus config.
- `ui.tsx` — tokens + primitives (`Card`, `KindDot`, `Spark`, `Ring`, `Receipt`, `Segmented`, `THEMES`)
  and `AREA_ACCENT` (keyed health/professional/finances/creativity/personal/food).
- `shell-types.ts` — `SurfaceCtx` = `{ openId, goRead, openPage, goFocus, goPlan, goHome, askPond,
setSessionActive }`.
- `surfaces/` — `home.tsx` (Today/Life — digest + "Across your life" 5-row read), `read.tsx` (long-form
  reader + the "Your marks" note-index), `plan.tsx`, `focus.tsx`. (read/plan/focus off-nav now.)
- `pages/` — dashboards, each self-contained (deterministic seed, local `Spark`/`Ring`/`Card`; **NOT
  Bklit**). New this cut: `area-overview.tsx` (shared), `tasks`, `trips`, `library`, `meal-plan`,
  `contacts`, `wishlist`, `journal`. Reused: `finance` (=Budget), `sleep`, `workout`, `recipes`,
  `grocery`, `shelf`, `project-tracker` (q3/ds/projects/mn/site). `reading-list.tsx` is orphaned
  (import removed) — harmless.

**Design discipline (hold it):** warm paper; **LIME `#c4e08a` = the only primary action**; **RUST
`#c2632f` = rare punctuation only**; sage `ACCENT` ambient; prose flat, modules = soft-shadow cards,
chrome = glass; one focal Instrument-Serif numeral per view; `clearing-rise` stagger. Every dashboard
mirrors `pages/finance.tsx` as the pattern reference.

## Gotchas

- **Console `all:true` is polluted** — a `:3002`/`:3010` server + stale `v48-prism`/`SKY`/`Invalid
time value` compiles. Judge errors from a **fresh reload at default level**, not `all:true`.
- **No `Math.random` / no `new Date()`** anywhere (stable screenshots).
- Folder-variant imports go up **two** dirs: `../../content`, `../../types`; charts (unused here) at
  `../../../components/charts`.
- Bklit (if ever used): `AreaChart` x must be an ISO date; `BarChart` names must be unique; charts need
  a sized parent. The local `Spark`/`Ring` sidestep all of it — prefer them.
- Don't animate `width/height/padding` (impeccable layout-transition rule) — use `transform: scaleX`
  for bars (see `finance.tsx` / `tasks.tsx`). One pre-approved exception: `focus.tsx` L211 padding
  on session start.

## Verify recipe (what "done" means here)

`npx tsc --noEmit` exit 0 · dev :3000 fresh reload · exercise the real interaction (not eyeball) ·
**0 console errors** at default level · screenshot to `wayfinder/screens/r6-v85-*.png`.

## Open / next

1. **Commit** — session 4 (full-of-data reshape) + session 5 (minimal-rail + area-as-page) are all
   uncommitted; `main` not pushed. Husky hook runs `eslint --fix`+`prettier`+`tsc` on staged files; a
   real ESLint _error_ reverts the commit.
2. Optional polish: trim the Today/Life "Enter focus" affordance; iterate area-overview spacing/copy
   live; decide whether Life should also list the areas as cards.
3. **The real goal** (these protos are throwaway): harvest v85's structure + interactions + the Press-
   zen skin into the **real chrome + module registry** — tickets **t11 (taxonomy) / t12 (registry) /
   t16 (AI composition)** in `wayfinder/map.md`. The area-as-page + page-as-module-spectrum maps
   cleanly onto hosts/modules.

## Screens (this cut)

`wayfinder/screens/r6-v85-loaded-{today,tasks,trips,library,budget,mealplan}.png`,
`r6-v85-area-overview-health.png`, `r6-v85-clearing-read-note-index.png`.
