# HANDOFF — R6: Folio-based UI pattern & feature explorations

**Directive (Charles, 2026-08-13):** the R1–R5 aesthetic round is over. Prune to the two
keepers and start a NEW round of prototypes that, instead of exploring *looks*, explore
**UI patterns and features** on the Folio foundation. Spread across four axes:
**new feature surfaces · interaction & input · navigation & IA · AI presence & agency.**
**Not capped at 15** — build as many as it takes to land each idea; extend the list freely.

## Already done this session (don't redo)
- **Pruned** `variants/` to keepers only: deleted v48/v51/v59–v70. `variants/index.tsx`
  now imports **only `v71-folio` + `v72-ledger`**; `variants: Variant[] = [v71, v72]`.
  (The whole `src/app/proto/` is git-untracked, so the pruned files are gone for good.)
- Registry has a comment marking where R6 variants (v73+) append.
- **RUN `npx tsc --noEmit` first thing** to confirm the proto still compiles post-prune
  before building anything.

## The harness (unchanged since R1)
- Route `/proto/visual-language`. Bottom chrome bar switches variants with **← / →**
  (arrow keys); each variant renders full-viewport. `Hide UI · h` toggles the switcher.
- A variant = `variants/vNN-name.tsx` exporting:
  ```ts
  export const variant: Variant = { id, name, pov, boldness, Component }  // Component = full-viewport view
  ```
  then add `import { variant as vNN } from './vNN-name'` + append to the `variants` array in
  `variants/index.tsx`. `boldness` is legacy (was the ladder position) — reuse the id number.
- **Shared seeded content** lives in `content.ts` — REUSE it so every variant shows the same Pond:
  `tree` (areas→children), `openPage`, `openNodeId`, `transcript`, `diffCard`, `contextLabel`,
  and the `Block` union (`text` | `todo` | `metric`). Add more seed there if a feature needs it.
- Modified **Next 16 / Turbopack** (root `AGENTS.md`). Dev server on **:3000**. If cloud-sync
  `"<name> 2.tsx"` dupes break tsc, `rm -rf .next`.

## The base: #71 Folio (copy its language)
`variants/v71-folio.tsx` is the product shell every R6 variant starts from. Lift its constants:
- **Palette:** `PAPER #efeae0`, `INK #2a2722`, `BODY/MUTED/FAINT/LINE` (ink alphas), `ACCENT #5f7355`
  (sage), `ACCENT_SOFT`. Earthy paper.
- **`glass` recipe** (blur+saturate+inner-highlight+soft shadow) — for floating chrome ONLY.
- `kicker` (mono uppercase micro-label), `kbd` (key cap), fonts `--proto-font-{sans,serif,display,mono}`.
- **The Folio product model = the contract to hold invariant across the round:**
  1. **Persistent left rail** of areas; areas contain **pages/subpages**. Navigation, not a view.
  2. A page is a **spectrum, not a type** — the only variable is **modules**: no modules → flat
     **document** (prose directly on paper, exportable); all modules → **dashboard**; between = valid.
     Text blocks are flat prose; modules (todo/metric/chart) are distinct **glass** cards.
  3. **Flat body, glass chrome.** The page surface is flat on warm paper; only floating chrome
     (chat, ⌘K palette, capture, notifications, control cluster) is glass hovering above it.
  4. Kept chrome primitives: **floating Ask chat · ⌘K command palette · Capture · Notifications
     drawer** (the demoted Timeline; Accept applies `diffCard`). Relationships was cut in Folio —
     but note axis-C/D below may reintroduce a *relationship/graph* idea as a deliberate feature.

## #72 Ledger — the built-out reference (reuse patterns, not required)
`variants/v72-ledger/` (a folder, not a file) shows the mature patterns to copy when a variant
needs real data viz or the full shell:
- `ui.tsx` (palette + `Panel`/`Stat`/`RingsPanel`/`DashboardHeader` + `glass`/`kbd` tokens),
  `data.ts` (deterministic LCG seeds — **no `Math.random`**), `dashboards/{health,work,wood,reading}.tsx`,
  `chrome.tsx` (the whole Folio chrome extracted as `<Chrome activeAreaId activePageId onNavigate/>`),
  `index.tsx` (rail + `AreaDashboard` switch + `<Chrome/>`).
- **Real Bklit charts** live in `src/components/charts/` (shadcn `@bklit` registry). Compositional:
  `<AreaChart data xDataKey><Grid/><Area dataKey/><XAxis/></AreaChart>`, `<BarChart>`/`<Bar>` (add
  `stacked stackGap`), `<LineChart>`/`<Line>` (`dashFromIndex` = dashed projection), `<RingChart>`/`<Ring>`,
  `<HeatmapChart>`/`<HeatmapCells>`. **Gotchas:** charts need a **sized parent** (`aspectRatio=""`
  + `className="h-full"` in a fixed-height wrapper) or they measure 0; **pass explicit colors**
  (Bklit's CSS-var theme is broken — the ticket-15 double-prefix bug). Reuse `<Chrome/>` from
  `v72-ledger/chrome.tsx` if a variant wants the shell wrapped around it.

## Build rules (hold these for the whole round)
- **Static mockup:** seeded data only, no backend, **no `Math.random`** (stable screenshots).
- All interactivity via **`useState`** (+ `useEffect` for key handlers). Full `100vh/100vw`.
- Keep the Folio palette + flat-body/glass-chrome ruling so the round reads as ONE product
  wearing different UI ideas — the variable is the *pattern/feature*, not the aesthetic.
- Each variant should **actually wire its headline interaction** (not a static picture of it).
- Prefer a `vNN-name/` folder (like Ledger) when a variant exceeds ~400 LOC or reuses `<Chrome/>`.

## Concept menu (curated seed — build these, reorder, extend; ids start at v73)
Each line: **name** — the pattern/feature it probes → the key interaction to wire.

**Axis A · New feature surfaces** (things Pond can't do yet)
- **Brief** — a morning digest page (what changed · what's due · one Pond suggestion) → dismiss/act per card; "start day" collapses it into the rail.
- **Queue** — a cross-area review inbox of AI proposals (edits, new-page ideas, links) → Accept/Reject per item, batch-accept, empty state.
- **Retro** — weekly review surface (highlights · stalled pages · streak) → pick wins → Pond drafts next week.
- **Agenda** — time-based planning (week columns / today timeline) placing pages by when → drag a page to a day; week↔day toggle.
- **Focus** — single-task focus mode (one page, timer, everything else dimmed) → start/stop; capture-without-leaving.
- **Atlas** — a map/graph of areas & pages (Relationships reconsidered as a *feature*, not a tab) → click node opens; hover shows links.

**Axis B · Interaction & input**
- **Inline-AI** — select text in a page → floating AI action bar (rewrite/expand/ask) → selection → menu → inline diff.
- **Command-first** — everything through ⌘K (create/navigate/run actions), no chrome buttons → fuzzy command list with modes.
- **Slash** — Notion-style `/` menu to insert modules/blocks into a page → type `/` → module picker → inserts, spectrum meter reacts.
- **Quick-add** — a persistent omni-capture bar that parses type + area as you type → live routing chips, Enter files it.
- **Drag-compose** — build a dashboard by dragging module chips from a tray onto the page → drag/drop + reorder; density meter reacts.

**Axis C · Navigation & IA**
- **Collapse-rail** — icon-only rail that hover/pins-expands; explore rail density & wayfinding → collapse/expand/pin.
- **Panes** — dual-pane / Miller columns: page + related page or chat side by side → open-in-right, resize.
- **Zoom** — semantic zoom area→pages→blocks as one continuous surface → zoom in/out control.
- **Tabs** — open pages as a tab strip / a working "session" of pages → open-in-tab, switch, close.
- **Spectrum-nav** — navigate by the Document——Dashboard axis: filter/sort the rail by page shape → shape filter chips.

**Axis D · AI presence & agency**
- **Ambient** — Pond leaves margin notes / inline suggestions on a page as you read → hover reveals, accept in place.
- **Activity** — a Pond presence ticker showing what it noticed/did in the background → expand an item → jump to it.
- **Diff-stack** — richer proposal pattern: a stack of typed diff cards (ties to ticket-16 `changes[]`) → per-card + group Accept.
- **Companion** — a persistent AI side-panel commenting on the current page/dashboard → pin, "ask about this".
- **Steward** — cognitive-dependency-aware nudges ("untouched 3wks — archive?"; "you decide, not me") → accept/snooze. (Ties to Pond's core ethos: steward, don't create dependency.)

That's ~22 concepts. Land each convincingly; split one into two variants if it has two distinct
takes; drop any that don't earn their keep. **Numbering: v73, v74, … in build order.**

## Per-variant verify bar (same as prior rounds)
`npx tsc --noEmit` clean · dev **:3000** · load `/proto/visual-language`, **→/←** to the new
variant · **exercise its headline interaction** (don't just eyeball) · **0 console errors** ·
screenshot to `wayfinder/screens/r6-vNN-*.png` · append it to `variants/index.tsx`.

## R6 progress log

**Wave 1 — one+ per axis, all shipped & verified (2026-08-13).** Each: `tsc --noEmit`
clean · loaded on dev · headline interaction exercised live · 0 console errors · screenshot
in `wayfinder/screens/`. Registered in `variants/index.tsx` → `[v71,v72,v73,v74,v75,v76,v77]`.

- **v73 · Command** (Axis B) — `v73-command.tsx`. Toolbar removed; one persistent command
  bar expands to a modal ⌘K palette with All·Go·Create·Ask·Run modes (chips **and** typed
  prefixes `@ + ? >`), subsequence fuzzy filter, full kb nav. Go navigates · Create adds a
  page · Run/Ask post an inline result strip. Screens: `r6-v73-command.png`, `-result.png`.
- **v74 · Slash** (Axis B) — `v74-slash.tsx`. Notion `/` picker inserts seeded blocks; the
  Document——Dashboard meter **and** the rail glyph (¶◧▦) animate live off module density.
  Verified: 2 prose → +Metric +Trend = "4 blocks · 50% modules", glyph ¶→◧. Screen: `r6-v74-slash.png`.
- **v75 · Brief** (Axis A) — `v75-brief.tsx`. Morning digest surface pinned atop the rail:
  what-changed / what's-due / one suggestion, Act+Dismiss per card (collapse anim), oversized
  hero counts actionable cards down live (verified 6→5), "Start day" clears it into the rail.
  Screen: `r6-v75-brief.png`.
- **v76 · Steward** (Axis D) — `v76-steward.tsx`. Cognitive-dependency nudges (staleness /
  over-reliance / overload / streak-pressure); each resolves IN PLACE recording which choice
  YOU made (Accept / Keep as is / Not now). Standing glass principle bar: "acts on its own —
  Never". Screens: `r6-v76-steward.png`, `-resolved.png`.
- **v77 · Collapse-rail** (Axis C) — `v77-collapse-rail.tsx`. 64px icon-chip rail (active
  area glows + caret); hover expands as a glass OVERLAY (peek, no reflow); pin locks it
  expanded and PUSHES the page. All three states verified. Screens: `r6-v77-collapse-rail.png`
  (peek), `-collapsed.png`, `-pinned.png`.

**SAVEE fold-in:** Charles's `savee.com/pfaffdesigns/boards/app-ui` board (44 pins, supplied
as a PDF) drove picks — dark spotlight→v73, `/`-insert→v74, oversized "50"/"75%" hero→v75,
icon-rail/IA-density→v77. (Login-walled online; only the print PDF was readable.)

**Gotcha found:** v73's palette starts OPEN and its input `stopPropagation`s keydowns, so the
harness ←/→/digit nav is dead until you `esc`. Fine for the proto, but when screenshotting,
**jump via the pip buttons** (`button[aria-label="NN. Name"]`) rather than arrow-counting.
Dev server ran on **:3001** (something already held :3000).

**Remaining menu (not yet built):** Axis A — Queue, Retro, Agenda, Focus, Atlas · Axis B —
Quick-add, Drag-compose · Axis C — Panes, Zoom, Tabs, Spectrum-nav · Axis D — Ambient,
Activity, Diff-stack, Companion. Numbering continues at **v81**.

**Wave 2 — first variant in the LOCKED Press skin (2026-08-13).**
- **v79 · Glance** (Axis A · new surface) — `v79-glance.tsx`. Charles asked for something
  "closer to" his app-ui reference board; its dominant motif is the iOS-widget GRID of
  oversized editorial numerals + the mono RUN RECEIPT. Glance = a cross-area HOME board
  (not a page) of widget tiles: Weekly mileage (spark), a real mono RUN RECEIPT tile,
  Today (agenda), Sleep, Streak (rust ring + 16-wk grid), Reading. **Headline interaction
  WIRED:** tap any tile to cycle size **S→M→L**; each size reveals more and the masonry
  grid reflows (verified Sleep S→M, Streak S→M→L live). Press tokens throughout; layout
  held (rail · glass cluster · bottom AI bar); AI bar wired. `tsc` clean · 0 console errors ·
  screens `r6-v79-glance.png` + `-resized.png`. Registry → `[…,v78,v79]`.
- **v80 · Board** (Glance PUSHED on all four axes — Charles: "take that and push it farther").
  A folder variant `v80-board/` (`ui.tsx` tokens+TileShell, `tiles.tsx` widget bodies+registry,
  `index.tsx` View). Still the LOCKED Press skin.
  · **Composable** — `⧉ Edit board` mode: per-tile **remove ✕** + **drag-to-reorder** (HTML5
    DnD, live reorder on dragover) + an **Add-widget catalog** of unplaced widgets (ghost cards).
  · **AI-composed** — a glass **"Pond noticed…"** suggestion tile (Accept pins a widget),
    one-tap **"✦ Compose my morning"** that re-arranges the board with a **staggered enter**
    (`enterDelay` on TileShell + `arrangeKey` remount), and **per-tile AI micro-notes**.
  · **Richer** — real **Bklit charts**: `AreaChart` mileage w/ dashed projection + `BarChart`
    sleep; a **Now weather hero** (72°); denser editorial numerals.
  · **Deeper** — tap a tile body → **expand-to-focus** modal (enlarged tile + S/M/L segmented
    + Open/Remove actions); **inline quick-actions** (check a todo in place); size-cycle reflow.
  TileShell is now a `role="group"` (not `<button>`) so it can host nested controls/actions.
  Verified live: compose rearrange, edit+catalog, focus modal, todo toggle — `tsc` clean ·
  **0 console errors**. Screens `r6-v80-board.png` · `-composed.png` · `-edit.png` · `-focus.png`.
  Registry → `[…,v79,v80]`.
  **Bklit gotchas found (add to the t15 chart notes):** (1) `AreaChart` is a **time-series** —
  its x field must be a **valid date string** (`new Date(x)`); label strings like `'W8'` throw
  `RangeError: Invalid time value`. Use ISO dates (`BarChart` w/ `xDataKey` stays categorical).
  (2) `BarChart` **keys bars by the `name` value** → duplicate names (`'T'`/`'T'`, `'S'`/`'S'`)
  collide (React dup-key error); names must be unique.

## ⭐ AESTHETIC DIRECTION LOCKED — v78 Press (2026-08-13)

**Charles's ruling:** the LAYOUT is locked — **left rail · top-right cluster (Notifications ·
Capture · Ask ⌘K) · bottom-center AI bar**. Don't move those. He supplied 4 new reference
boards (Pinterest `pin/847028642465868487` + `...868356`, screenshots on Desktop
`2026-08-13 at 3.48.*.png`) and asked to fold their *aesthetic/feel* into Pond. Result =
**`variants/v78-press.tsx`** (id 78, registered last), tsc-clean, 0 console errors, screen
`wayfinder/screens/r6-v78-press.png`. **This is the chosen visual direction going forward.**

**The Press aesthetic (extract + how it's built) — reuse these tokens for all further work:**
- **Warm paper base** `PAPER #efeae0`, richer ink `INK #211f1b`; near-white **card surface**
  `CARD #faf8f2`.
- **Floating soft-shadow widget cards** for modules (the iOS-widget look):
  `cardShadow = 0 1px 2px rgba(40,34,24,.05), 0 10px 28px rgba(40,34,24,.09)`, radius 20.
  Prose body stays FLAT on paper (Folio ruling held); modules = these cards; chrome = glass.
- **Oversized editorial numerals** — Instrument Serif (`--proto-font-display`) at 46–68px for
  metrics (mileage hero = 68px).
- **Mono technical labels** (`kicker`, letter-spacing .2em) + a **dashed "receipt" stat block**
  in the rail (`WEEK RECEIPT` — mono rows, rust for the streak).
- **Signature pale-lime "Save/Send" pill** = `LIME #c4e08a` bg / `LIME_INK #2c3a17` text — the
  primary action (Ask/Send pill, todo check-circles).
- **Sparing rust-orange emphasis** `RUST #c2632f` — active-area marker (rounded square), metric
  trend `↑`, sparkline, streak. One accent, used rarely.
- **Liquid-glass chrome** (frostier than Folio): `blur(24px) saturate(1.4)`, white top-highlight,
  `0 22px 60px rgba(40,34,24,.16)` — used for the top-right cluster + the bottom AI pill bar.
- Sage `ACCENT #5f7355` kept for area accent / active-nav wash `ACCENT_SOFT`.

**NEXT (fresh session — context ran out here):** (a) iterate Press's palette/spacing with Charles
in the browser; (b) **roll the Press skin onto the wave-1 pattern variants v73–v77** so pattern +
aesthetic converge; (c) then harvest into the real chrome + module registry (t11/t12/t16). The
pattern *interactions* from v73–v77 are the keepers; Press is the *skin* they should wear.
Chrome buttons in v78 are presentational only (not yet wired) — wire from v71 Folio when needed.

## Wave 3 — SHIPPED & VERIFIED (2026-08-13)
Four fleshed-out prototypes (briefed in `wayfinder/R6-wave3-briefs.md`), built by parallel agents as
isolated folders, now **registered + browser-verified**. Registry → `[…,v80,v81,v82,v83,v84]` (14 total).
`npx tsc --noEmit` clean. Dev server was already up on **:3000** (served the route directly).

- **v81 · Reader** (Axis A/B · document end) — `v81-reader/` (index.tsx + ui.tsx). Verified live: click
  a sentence → floating glass action bar (**Highlight** persists a mark, rail MARKS 1→2 · **Annotate**
  opens an inline margin-note editor, typed + Saved → NOTES increments · **Ask Pond** posts the quoted
  selection into the AI bar with an inline answer · Copy). Reader-settings panel (typeface serif/sans,
  size, measure, theme paper/sepia/night) applies **live** (tested Sans + Night). Reading progress
  tracked (0%→43% on scroll) + heading outline. 3 Pond ambient margin notes. 0 console errors.
  Screen: `r6-v81-reader.png`.
- **v82 · Console** (Axis B/D · dark power mode) — `v82-console/` (index.tsx + ui.tsx + data.tsx). The
  allowed DARK inversion, layout held. Verified: typed `status` executes → multi-line readout appended
  to scrollback; `open ` shows a live page-suggestion list; clicking `open q3` navigates (OPEN context →
  Q3 Planning) + logs `▸ loaded…`; **RUN** on idle WEEKLY_RECAP → `⚡ exec…` then `✓ …state=active`
  (state change). Dark readouts + Bklit area chart + radio dial render. 0 console errors.
  Screen: `r6-v82-console.png`.
- **v83 · Agenda** (Axis A/C · temporal home) — `v83-agenda/` (index.tsx + ui.tsx). Default = Day.
  Verified: `browser_drag` "16-mile long run" tray→07:00 slot (Unscheduled 5→4, renders as timeblock);
  **Plan my day** auto-arranges remaining 4 into open hours (Unscheduled→0, "All scheduled ✓", staggered);
  **Week↔Day** toggle swaps 7-col planner ↔ hour timeline; rail Aug-2026 calendar day-click (Aug 14)
  re-points planner → Friday. 0 console errors. Screen: `r6-v83-agenda.png`.
  **FIXED the flagged AI-slop tell:** the `3px solid ${accent}` thick colored side-borders on the day
  chip (was L348) and week mini-chip (was L393) → softened to a **6–7px accent dot** (keeps per-item
  color-coding, drops the slop bar). Detector now clean on v83.
- **v84 · Player** (Axis A/D · focus session) — `v84-player/` (index.tsx + ui.tsx). Verified: picker
  (25 MIN + Q3 Planning) sets transport context; Ambient switch → SILENT, checklist item toggles
  (2/4 KEPT); **Start** → timer counts UP (00:00→00:10, −24:50 · 25 MIN), pickers disable, state "ON AIR";
  **Stop** reveals the Press summary overlay (big "0 MIN FOCUSED" numeral — <1min elapsed rounds to 0 —
  Page/Protocols-kept/Length stats + Pond note + New-block/Ask actions). Screens: `r6-v84-player.png`
  (running), `r6-v84-player-summary.png`.
  **FIXED a real console error:** the checklist strikethrough mixed `textDecoration` (shorthand) with
  `textDecorationColor` (longhand) → React styling error on every toggle. Changed shorthand →
  `textDecorationLine` (index.tsx L362). Now 0 console errors.

**`/impeccable audit` result: 16/20 Good · Implementation Integrity PASS.** Detector clean on v82/v83;
only the **3 pre-approved** layout-transitions remain (v81 L205/L256 `width`/`max-width`, v84 ui.tsx
L152 `height`) — the intentional reader-resize / summary-reveal reflows, same call held for v79/v80,
**left as-is**. Minor P3s (FAINT/MUTED micro-label contrast, desktop-only) are proto-acceptable. All
four express one coherent Pond system on the locked layout; v82 proves the Press skin inverts to dark.

**Full R6 registry now:** `[v71 Folio, v72 Ledger, v73 Command, v74 Slash, v75 Brief, v76 Steward,
v77 Collapse-rail, v78 Press, v79 Glance, v80 Board, v81 Reader, v82 Console, v83 Agenda, v84 Player]`.

## Wave-1 → Press convergence — SHIPPED & VERIFIED (2026-08-13)
Executed NEXT item **(b)**: rolled the LOCKED Press skin onto the wave-1 pattern variants
**v73–v77** so pattern + aesthetic converge. Skin-only — every headline interaction, all state,
handlers, and the locked layout were held byte-for-byte; only tokens (palette, glass recipe,
module→soft-shadow cards, oversized Instrument-Serif numerals, pale-lime primary pill, round lime
todo checks, sparing rust markers/trends) changed. Built by 5 parallel agents (one per file, no
edit conflicts). `variant` ids/names unchanged; `index.tsx` untouched. `npx tsc --noEmit` clean.

Each re-skin browser-verified on dev **:3000** with its headline interaction exercised live +
**0 console errors** (fresh-load sweep after cycling all five + a todo toggle):
- **v73 Command** — ⌘K palette open/close; body shows Press soft-shadow cards, serif "38", round
  lime checks, rust "↑ +12%", rust active-area marker. Screens: `r6-v73-command-press.png`, `-body.png`.
- **v74 Slash** — `/` → **Press glass** picker (rust MODULE badges) → inserted a **Press card**
  (soft-shadow "38 mi"); spectrum meter reacted 0%→33% and rail glyph flipped. Screens:
  `r6-v74-slash-press.png`, `-picker.png`, `-inserted.png`.
- **v75 Brief** — hero counted **6→5** on Dismiss (card collapse anim held); suggestion card shows
  the lime "Draft it" pill. Screens: `r6-v75-brief-press.png`, `-dismissed.png`.
- **v76 Steward** — Accept resolves in place ("You accepted · Archived", undo); principle bar keeps
  the sage 🌿 chip; accept pill confirmed pale-lime at device scale (`r6-v76-accept-pill.png`).
  Screens: `r6-v76-steward-press.png`, `-resolved.png`.
- **v77 Collapse-rail** — collapsed icon rail (sage-active chip) → hover expands as a **Press glass
  overlay** (peek, no reflow); Press module cards on the page. Screens:
  `r6-v77-collapse-rail-press.png`, `-peek.png`.

**Bug fixed during this pass (add to t15/console notes):** v73/v74/v77 inherited v78 Press's Todo
label style, which mixes the `textDecoration` **shorthand** with the `textDecorationColor`
**longhand** → React "mixing shorthand/non-shorthand" console error on every checked-todo render
(the same class the handoff fixed in v84). Fixed all three by `textDecoration` → `textDecorationLine`.
**⚠️ v78-press.tsx L118 still has the original shorthand mix** — left as-is (v78 is the locked skin,
out of this task's scope), but it will emit the same warning and should get the one-line fix when v78
is next touched or harvested into the real chrome.

**Remaining from the NEXT list:** (a) iterate Press palette/spacing with Charles in-browser;
(c) harvest the v73–v77 interactions + Press skin into the real chrome + module registry (t11/t12/t16).

## v85 · Clearing — the consolidation (2026-08-13)
**Directive (Charles):** take the best parts of the last six protos (v79–v84) and fuse them
into ONE fully-fleshed proto, **pushing the zen vibe to the extreme — elegance, balance, calm.**
Decisions taken up front: input = v79–v84; treatment = **evolve Press toward calm** (keep the DNA —
warm paper, Instrument-Serif numerals, glass chrome, soft-shadow cards — but dial back to air, muted
accents, one focal element per view, slower motion); deliverable = **a new multi-surface shell**.

**Built:** a folder variant `variants/v85-clearing/` (registered last → id 85, registry now 15).
- `ui.tsx` — the zen-Press design language (tokens + primitives: Card, KindDot, Spark, Ring, Receipt,
  Segmented, THEMES). Calm discipline encoded: **LIME = the only primary-action color**; **RUST = rare
  punctuation only**; sage ACCENT = ambient tint; prose flat, modules cards, chrome glass; softer
  cardShadow; slower EASE. `shell-types.ts` = the `SurfaceCtx` contract; `data.ts` = seed (reuses
  `../../content`; adds a real long-form READER doc split to sentences + AMBIENT_NOTES, a morning
  DIGEST, an agenda TRAY, focus config).
- `index.tsx` — the shell on the **LOCKED layout** (left rail · top-right glass cluster · bottom AI
  bar). Rail = Pond wordmark + a 4-lens switch (**Today · Read · Plan · Focus**) + area/page tree +
  Week receipt. Wired: ⌘K palette (the one keeper salvaged from v82 Console — a **light** subsequence
  fuzzy-nav, not the dark shell), Capture toast, Notifications drawer (Accept applies the `diffCard`),
  bottom Ask chat. **Focus-mode chrome-recede** lives here: when a session is live the rail dims to 0.4
  and the cluster + AI bar fade to 0.
- Four surfaces (built by 4 parallel agents against the fixed `ui.tsx`/`SurfaceCtx` contract, then
  integrated by hand): `surfaces/home.tsx` (Today — digest, one focal serif numeral that decrements
  live on dismiss; from v83 + v79 + v80's stagger), `surfaces/read.tsx` (the zen star — serif long-form,
  live measure/typeface/size/theme paper·sepia·night, click-sentence → glass action bar
  Highlight/Annotate/Ask Pond/Copy, ambient margin notes, progress bar + outline; from v81),
  `surfaces/plan.tsx` (day hour-timeline + week grid, HTML5 drag-to-schedule, "Plan my day" staggered
  auto-arrange, one rust "now" line, KindDots not slop-bars; from v83), `surfaces/focus.tsx` (session
  player — 320px dial + count-up timer, chrome recedes, Press summary overlay; from v84).

**Cut for calm:** v82 Console's dark shell (kept only ⌘K); the dual rust/lime gradient orbs every
harvest flagged as editorial noise (→ one faint slow sage wash); oversized-numeral overuse (→ exactly
one focal numeral per surface).

**Verified — proof, not claims.** `npx tsc --noEmit` exit 0 project-wide. Dev **:3000**, fresh
clean-room load, jumped via pip `button[aria-label="85. Clearing"]`, exercised each headline
interaction live: Today focal **3→2** on dismiss; Read sentence-click raises the 4-action bar +
Highlight persists a mark; Plan **"Plan my day" Unscheduled 5→0**; Focus **Start → rail opacity 1→0.4 +
cluster/AI-bar fade + "ON AIR" + count-up 00:00→00:06 → Stop → summary + chrome restores**; ⌘K "wood"
fuzzy-matches Walnut Shelf. **0 console errors / 0 warnings** on the fresh navigation after the full
sweep. (The `all:true` history is polluted with a **:3002** server's `bar-hrs`/`Invalid time value`
and stale `SKY`/`v48-prism`/pre-fix `../content` compiles — none live on v85.) No v85 file uses the
`textDecoration` shorthand (grep-confirmed) — the recurring bug class is absent here.
Screens: `wayfinder/screens/r6-v85-clearing-{today,read,plan,focus-idle,focus-running,focus-summary}.png`.

**Gotcha (add to the folder-variant notes):** a `vNN-name/` folder sits one dir deeper than the
single-file variants, so it must import the shared proto seed/types as **`../../content`** and
**`../../types`** (not `../…`). tsc caught it; the dev server 500'd until fixed. (v72-ledger follows
the same rule.)

**NEXT candidates:** iterate the Clearing palette/spacing live with Charles; wire real drag on Plan
week view; then this is the strongest candidate to harvest into the real chrome + module registry
(t11/t12/t16) — the four surfaces map cleanly onto page-as-module-spectrum + hosts.

## When the round is done
Update this file with what shipped, refresh `wayfinder/map.md` (ticket-14), and the `pond-v4`
memory. These are still throwaway (`src/app/proto/`) — the point is to harvest patterns/features
into the real chrome + module registry (t11/t12/t16), not to keep the protos.
