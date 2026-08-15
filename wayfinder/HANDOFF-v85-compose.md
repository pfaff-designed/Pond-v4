# HANDOFF — v85 "Clearing" + AI-composition feel-proto (t16)

_Written 2026-08-15, end of session 6. Standalone current-state summary. Prior
state: `wayfinder/HANDOFF-v85-loaded.md` (full-of-data life system); longer history
in `wayfinder/HANDOFF-r6-folio-patterns.md`._

## TL;DR

This session (a) **committed** the uncommitted session 4–5 work (`c925a1c`), then (b)
built and validated an **AI-composition feel-proto** — the one interaction v85 hadn't
dramatized (t16: Pond assembling a view that didn't exist), then (c) **collapsed quick
capture into the ⌘K palette**. `main` is still **not pushed**. `tsc --noEmit` = exit 0,
live run = **0 console errors**.

## Run it

- Dev: **http://localhost:3000/proto/visual-language** (v85 is the only variant).
- If down, from repo root `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`:
  `PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH node node_modules/next/dist/bin/next dev -p 3000`
  (Node 22 = stable Turbopack path.)
- Typecheck: `PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH node node_modules/typescript/bin/tsc --noEmit`

## What shipped this session

### 1. Committed the loaded life-system (`c925a1c`)

Session 4–5 (5 areas · area-as-page · minimal rail · 7 new dashboards) was all
uncommitted; committed it. Also deleted **198 macOS/iCloud `… 2.tsx/2.png/2.md` dedup
artifacts** that were polluting the working tree (`src/components/charts`, `wayfinder`).
Husky (eslint --fix + prettier + tsc on staged) blocked once on a real ESLint error
(`focus.tsx` ref-assign during render) — fixed by moving `finishRef.current = finish`
into a `useEffect`.

### 2. AI-composition feel-proto (the main work)

**One streaming engine, three triggers, from the three real entry points.** Answers
the "how does composition FEEL" question before building it for real.

- **`surfaces/compose.tsx`** (new, ~430 lines) — plays a `ComposeScript` on a timer.
  `head` = index of the beat currently materializing; `< head` filled, `=== head`
  skeleton/typing, `> head` unseen; `beats.length` ⇒ settled → landing bar. Beats:
  `read` (narration trace line), `module` (card that materializes skeleton→filled,
  carries a **"why · …" rationale**; body rendered from ui.tsx `Ring`/`Spark`/stat/
  diff/list), `uncertain` (Pond asks instead of guessing — a dashed card with a
  question + two options; **non-blocking**). Deterministic: `setTimeout` only, no
  `Date.now`/`Math.random`. `settled` prop re-opens a pinned composition fully-filled
  with no timer/landing bar.
- **`data.ts`** — added `ComposeId = 'week' | 'capture' | 'newtopic'`, the beat/script
  types, and `COMPOSE` (the three scripts). Each script: `eyebrow`, focal `title`,
  `ask`, `landCta`, `landToast`, optional `pin`, `beats[]`.
- **`index.tsx`** wiring:
  - `compose` state `{ id, seed?, settled? }` renders `<Compose>` in `<main>`,
    preempting the active surface. `startCompose()` / `landCompose()`.
  - **Ask bar** → `isComposeQ(t)` ("shaping up", "this week", "across everything",
    "one view", "how's my week/life") launches `week`.
  - **Capture** (now via palette, see #3) → `capture`.
  - **⌘K** free text matching `/^(track|start tracking|new page|add a page|create)/i`
    → `newtopic`.
  - Chrome **recedes** during compose (cluster · AI bar · cushion fade via
    `composeActive` in `chromeStyle`); rail stays.
  - Landed compositions **pin into a new "Pinned" rail section** (`pinned` state,
    `{id,title,area,cid}`); clicking a pin re-opens it `settled`.

The three scripts:

- **week** (Ask): "This week, in one view" — Marathon ring (38 mi) · Design System
  "At risk" · Dining $48 over · Lisbon list · uncertain Walnut Shelf → **Pin to rail**.
- **capture** (Capture): "Filed to Marathon Training" — routes the thought, shows the
  long-run **diff** (Sat→Sun) · uncertain "log knee as symptom?" → **Apply the change**.
- **newtopic** (⌘K): "Half Marathon" — race-day ring · mileage spark · plan list ·
  uncertain "under Health / new area?" → **Create page**.

### 3. Collapsed quick capture into ⌘K

Removed the top-right **＋ Capture button + popover** (cluster is now **◔ · ⌘K**).
Palette free text now offers **Capture: "…"** + **Ask Pond: "…"** side by side;
Capture runs `startCompose('capture', text)`. Dropped the note/task/expense + area
pre-classification (Pond routes it instead) and removed the dead capture
state/handlers/`CAPTURE_KINDS`. Placeholder: "Go to a page, capture a thought, or
ask Pond…".

## Validation (proof — all done live via Playwright)

- All three scenarios streamed end-to-end; uncertain beats interactive; chrome
  receded; both `week` and `newtopic` **pinned to rail**; pinned **re-open settled**
  ("a live read, recomposed each time you open it").
- Capture-from-palette routes into the compose surface with the typed seed echoed.
- `tsc --noEmit` exit 0 · **0 console errors** at default level on fresh reload.
- Screens: `wayfinder/screens/r6-v85-compose-week.png`, `…-compose-newtopic.png`.

## Gotchas

- **No `Math.random` / no `new Date()`** anywhere (stable screenshots). Compose uses
  `setTimeout` for streaming — fine.
- Don't animate `width/height/padding` (impeccable layout-transition rule) — compose
  uses transform/opacity. The one pre-approved exception remains `focus.tsx` padding
  on session start (documented; impeccable re-flags it, leave it).
- The ⌘K palette-open **click can appear to toggle** during automated testing — a
  browser-harness timing artifact, not app behavior; it opens and works normally.
- Compose scripts are **fixed** — the seed text is dynamic/echoed, but the streamed
  module content is canned per scenario (this is a feel-proto, not real composition).

## What the proto bought us (for the real build)

The composition loop reads well: streaming cadence + per-module "why ·" makes Pond's
reasoning legible; the uncertain beat lands as **judgment, not error**. The clearest
signal for the real registry: **a pinned view = a saved composition spec**, not a
static page ("recomposed each time you open it").

## Open / next

1. **Push** `main` when ready (currently ahead of upstream, unpushed).
2. **The real goal** (protos are throwaway): harvest v85 structure + the composition
   loop into the real chrome + module registry — tickets **t11 (taxonomy) / t12
   (registry) / t16 (AI composition)** in `wayfinder/map.md`. Map: area-as-page →
   hosts; page-as-module-spectrum → modules; **pinned composition → saved composition
   spec** consumed by t16; the compose beats (`read`/`module`/`uncertain`) → the real
   streaming contract.
3. Optional: give `newtopic`/`week` distinct module content per real data; add a
   streaming-text effect on narration lines; trim the Today "Enter focus" affordance.

## Files touched this session

- `surfaces/compose.tsx` (new), `data.ts` (+COMPOSE), `index.tsx` (compose wiring +
  capture-collapse + pinned rail), `surfaces/focus.tsx` (ref-in-effect lint fix, s4–5
  commit), plus the session 4–5 files in `c925a1c`.
