# Handoff — F27 shipped, PR #22 open + CI green (2026-09-01)

Repo: `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`

## Status: F27 DONE, in review (CI green)

F27 (issue #10 — kanban cards linkable to pages) is **built, tested, verified
live, committed, pushed, PR'd, and CI-green**. Nothing merged.

- Branch: `feat/f27-card-page-links`, commit `a9966e7` (impl + tests + spec in one commit).
- PR: **https://github.com/pfaff-designed/Pond-v4/pull/22** → base `main`, closes #10.
- Gates: **jest 846 green** (+12 new), `tsc` clean, `eslint` clean.
- **CI GREEN**: both checks pass — "Lint · Typecheck · Test · Build" + "Storybook tests (Playwright)". `MERGEABLE`, `OPEN`.
- Grilled + specced first (per AGENTS.md): `wayfinder/SPEC-f27-card-page-links.md`.

**Also merged this session:** F25 #9 drag-to-reparent (PR #21, `1f14e5d`) — user confirmed.

## What shipped (F27)

**Roadmap-premise correction:** the roadmap frames F27 as "closing the AI-scaffolds-
but-UI-can't-honor gap." That scaffolding **does not exist in code** (no `pageId` on
cards, no AI emit, no warning) — F27 is **net-new**, not a bug repair.

**Grill decisions:** card-as-page semantics via a **HYBRID store** — card gains
optional `pageId`; card always keeps a denormalized `title` cache (fast render, AI
unchanged, NO migration); when linked, the page is source-of-truth (title syncs from
it; editing a linked card's title **writes through** to the page). AI stays out this
cycle (`pageId` stripped from the emit schema). Both mint-new-child + link-existing +
unlink; `+ Add card` stays quick free-text. Same-panel navigation.

- `src/lib/modules/kanban/schema.ts` — `+ pageId?: string` on `kanbanCardSchema` (a
  reference, NOT a minted id; `nestedIdPaths` unchanged, id-walkers leave it alone).
- `src/lib/modules/ai-composition.ts` — `pageId` added to the `kanbanData` card
  omit-chain so the model can neither read nor author links.
- `src/lib/modules/page-link/` (NEW) — the capability seam, via **React context**
  (codebase idiom, like `SiblingBlocksProvider` — NOT prop-threading):
  - `resolve.ts` — pure `resolvePageFromRows` / `searchPagesInRows` (+ `resolve.test.ts`).
  - `context.tsx` — `PageLinkProvider` + `usePageLinks()` (returns `null` when unmounted).
  - `use-capabilities.ts` — `usePageLinkCapabilities(pageId)` builds resolve/search/
    navigate/create/rename from the `['pages',workspace]` cache + router + supabase.
- `src/components/organisms/BlockCanvas.tsx` — mounts the provider ONCE (so the
  editor, Life home, AND area pages all get links; the AI-terminal reference render
  doesn't use BlockCanvas → degrades to plain cards). No DocumentPanel changes (net zero).
- `src/lib/modules/kanban/view.tsx` — ↗ linked glyph; card ⋯ menu (Open / Create page
  & link / Link existing inline picker / Unlink); orphan → "missing" marker (Open
  hidden, cached title kept). Read-only render unchanged. (+ `move.test.ts` link cases.)

Resolution/search read the already-loaded pages cache (no extra fetch); create parents
the child at the containing pageId + optimistic insert (the CreatePageModal tail).

## Live /verify results (all passed, :3000, DEV_AUTOLOGIN=1)

create page & link (card linked + child in rail) · Open → navigates to correct nodeId ·
write-through rename (rail + page title update) · link-existing picker filters/binds ·
unlink → reverts to free-text, page untouched · orphan (linked page deleted) → board
still loads, "missing" marker, Open hidden, cached title kept. Console clean on fresh load.

**GOTCHA (verify harness):** React `onBlur` is delegated via the bubbling `focusout`
event — a synthetic non-bubbling `blur` Event does NOT fire it. Write-through "failed"
twice until I used a real `el.focus()` + `el.blur()`. The code was correct; the test
dispatch was wrong. (Analogous to F25's "Playwright can't fake native DnD" note.)

## To close this out

1. **Merge PR #22.** CI is green and it's `MERGEABLE`. Merging auto-closes #10.

## Next roadmap item (fresh session — it's the big one)

**The Database Primitive epic** (issues #16–20; `wayfinder/ROADMAP-notion-parity.md`
§3) — the crown epic, and the user explicitly wants "the hardest things first." Four
pieces in dependency order:

1. **Page properties / typed metadata** — pages gain a schema of typed fields
   (select/date/number/status/relation). Foundational; everything rides on it.
2. **The collection** — a page whose children share a property schema (a Notion
   "database" = a page whose kids are homogeneous). Builds on the page tree.
3. **Views** — table / board / calendar / gallery as _renderings of one collection_,
   not separate blocks. **Today's `table` and `kanban` blocks BECOME views over a
   collection.** Filter/sort/group are per-view config.
4. **Relations & rollups** — a property pointing at pages in another collection +
   aggregations. Fold in F14 (cross-page rollups) as the rollup seed.

**MANDATE: grill-first, then spec, BEFORE any code** (AGENTS.md). It's a multi-wave
schema-migration arc — bounded (one coherent system) but large. **First fork to
resolve in the grill:** does **kanban become a view over a collection** (which
reshapes the F27 card→page work) or stay a standalone block? F27 (PR #22) is the
down-payment — build on its `page-link` seam.

**Suggested fresh-session kickoff prompt:**

> Grill me on the Pond-v4 Database Primitive epic (#16–20 in
> `wayfinder/ROADMAP-notion-parity.md` §3). Read `project-pond-v4-f25` memory + the
> roadmap first. Grill-first per AGENTS.md before any spec/code. F27 (card→page
> links, PR #22) is the down-payment — build on that seam. Start with the fork:
> does kanban become a view over a collection, or stay a standalone block?

After the Database Primitive: F1 #11 (build the timeline module — narrowed; loud
accept-skip already shipped), F13 #12 (promote heatmap/stat to module types), F23 #13
(de-sycophancy persona, `prompt.ts`), F24 #14 (SMS Pond).

## Housekeeping / env gotchas

- **Dev data rearranged** during verify: a test card ("Mill stock", now orphaned) sits
  on the Life-home kanban; a "Cut boards"/"Mill stock" child page was created then
  deleted. Harmless — dev workspace. Delete/drag the stray card if it bothers you.
- **Dev server** on :3000 was already running (pre-existing, not started by me) —
  leave it or restart as needed.
- **Push:** `origin` push URL is HTTPS (SSH stalls, no TTY). Configured.
- **Supabase** free tier auto-pauses after ~1wk idle → NXDOMAIN. Was awake this
  session. Restore via management API `POST /v1/projects/ifhahsvgqedvygpdeaix/restore`
  (token in macOS keychain "Supabase CLI"), ~4 min.
