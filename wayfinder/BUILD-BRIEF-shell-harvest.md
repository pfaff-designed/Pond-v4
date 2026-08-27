# Build Brief: v85 Shell Harvest — proto home UI into the real app

**Status:** SPECCED (grilled 2026-08-26, all decisions user-confirmed) — ready to build in a fresh session.
**Source proto:** `src/app/proto/visual-language/variants/v85-clearing/` (index.tsx shell, ui.tsx primitives, pages/area-overview.tsx, data.ts fake data). Aesthetic = R6 "Press" (locked).
**Target:** the real workspace app (Sidebar/PageTreeItem + DocumentPanel + AITerminal, home = "Select a page" empty state).

## Decisions (grilled + resolved)

1. **Scope = full shell harvest (a).** Rail + top bar + Life overview + Press aesthetic become the real app chrome; DocumentPanel/AITerminal render inside it. Sliced chrome → Life surface, specced as one effort.
2. **Rail is fully data-driven (a).** Every top-level page is a rail entry: `type='area'` → collapsible folder (caret toggles children, name opens the page), other types → plain leaf row. No hardcoded areas; the five canonical areas are seed content. Junk pages are a data problem, not a UI filter.
3. **Type-switched page view (a).** `type='area'` renders the overview surface — children as cards + focal numeral derived from real data (see proto `AREA_OVERVIEW` pattern; generalize, don't port the hardcoded config). All other types keep the DocumentPanel editor. An area's own blocks are ignored for now (acceptable; composite view is a named follow-up).
4. **Life/home v1 is structural only (a).** Root overview = card per area with real child counts/recent activity + focal element, Press-styled. NOT in scope: "Across your life" AI synthesis (own future effort, needs its own grill) and the notifications spine (no notifications system exists).
5. **Aesthetic = global tokens, targeted redesign (c).** Press type/color/spacing go into the global Tailwind theme so editor + terminal inherit the palette; bespoke Press treatment only for chrome + overview surfaces. Editor/terminal Press redesign = named follow-up.
6. **Chrome interactions:**
   - AITerminal stays exactly where it is (bottom panel + context bar), Press-tinted only.
   - Top bar: `＋` → existing new-page flow; `⌘K` → focuses the terminal input (proto's free-text→Pond); `◔` notifications icon OMITTED (dead icon worse than none).
   - Rail CRUD: keep per-row create/delete but hover-revealed, so the resting rail reads like the proto.
7. **Component placement.** Harvest into the existing atomic tree (organisms: rail/shell/top bar; molecules: overview card, focal numeral), shadcn primitives where they already fit, proto-specific pieces ported from scratch, Storybook story per component (per established front-end workflow). **The 16 proto dashboard pages (tasks/trips/library/recipes/…) are explicitly OUT of scope** — they arrive later as registry modules, one at a time.

## Suggested slices (each commits green: tsc, eslint, jest, stories)

1. **Press tokens** → global Tailwind theme (fonts/colors/spacing pulled from the proto's styling). App-wide tint shift, no layout change.
2. **Rail organism** — data-driven from `listPages` tree (React Query `['pages']`), collapsible area folders, hover CRUD, replaces current Sidebar in the workspace layout.
3. **Top bar** — icon-only `＋` / `⌘K`, wired as above.
4. **Overview surface** — shared data-driven component (focal numeral + card-per-child) + type-switch in the main panel: area → overview, else → DocumentPanel.
5. **Life/home** — overview applied at root (areas as cards), replaces the empty state.
6. **Live /verify pass** — real browser, real data: rail collapse/expand/navigation, area overview vs editor switching, home cards, ＋/⌘K, terminal flow (create_page proposal → picker → save) unaffected.

## Constraints & gotchas for the builder

- Read `node_modules/next/dist/docs/` before Next.js work (repo AGENTS.md rule — this Next version differs from training data).
- Follow the repo's grill-then-spec rule: this brief IS the spec; if a real ambiguity surfaces mid-build, ask, don't guess.
- Proto is reference-only — do NOT import from `src/app/proto/**` into app code; copy and adapt. Leave the proto untouched.
- `jest.config.ts` needs ts-node in some node setups — see repo memory (throwaway JS mirror config trick) if jest won't boot.
- Query keys: pages tree uses `['pages']`; new rail must invalidate the same keys the current Sidebar/PageTreeItem does or creates/deletes will go stale.
- Supabase project auto-pauses when idle (free tier) → NXDOMAIN; restore via dashboard or management API before live-verifying.
- Dev autologin: `DEV_AUTOLOGIN=1` in `.env.local` (`src/proxy.ts`).

## Follow-ups (explicitly deferred, do not build now)

- "Across your life" AI synthesis on Life
- Notifications system + ◔ + left-spine timeline
- Press redesign of DocumentPanel + AITerminal internals
- Composite area view (overview + own blocks)
- Dashboard modules via registry
