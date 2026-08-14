# R6 · Wave 3 — Four fleshed-out prototypes (briefs + build contract)

**Directive (Charles, 2026-08-13):** from the app-ui reference board, write 4 creative briefs and
execute them — this wave the bar is a **very fleshed-out prototype** each (multiple wired
interactions, real seeded depth, states), not a single-interaction sketch. All wear the LOCKED
**Press** skin (v78) and hold the locked layout, except **v82 Console** which is a deliberate
DARK inversion of Press (same layout, inverted palette). Numbering **v81–v84**.

The board (savee/pinterest `app-ui`) clusters into recurring motif families. Each brief anchors on
one cluster the existing variants (v71–v80) haven't mined yet.

---

## SHARED BUILD CONTRACT (every agent follows this)

**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` · **Route:** `/proto/visual-language`.
**Harness:** bottom chrome switches variants (← / → + pip buttons `aria-label="NN. Name"`); each
variant renders full-viewport. Dev server on **:3000** (may bump to **:3002** if held).

**Variant contract** — create a **folder** `src/app/proto/visual-language/variants/v8N-name/`
(like `v80-board/`), `'use client'`, exporting from its `index.tsx`:
```ts
export const variant: Variant = { id, name, pov, boldness, Component } // Component = full 100vh/100vw view
```
- **DO NOT edit `variants/index.tsx`.** Central registration + browser verification happen AFTER,
  to avoid parallel-edit races. Your job: build the folder + make `npx tsc --noEmit` clean.
- Reuse shared seed from `../../content` (`tree`, `openPage`, `transcript`, `diffCard`, `Block`,
  `Message`). Add local seed as needed. **No `Math.random`, no `Date.now()`, no argless `new Date()`**
  (breaks stable screenshots) — hardcode deterministic values / ISO date strings.
- All interactivity via `useState`/`useEffect`. Full `100vh/100vw`.

**Press skin** — lift tokens from `variants/v78-press.tsx`: palette (`PAPER #efeae0`, `INK #211f1b`,
`BODY/MUTED/FAINT/LINE`, `CARD #faf8f2`, `ACCENT #5f7355` sage, `LIME #c4e08a`/`LIME_INK #2c3a17`,
`RUST #c2632f`, `ACCENT_SOFT`), `cardShadow`, `glass` recipe, `kicker`, `kbd`, fonts
`--proto-font-{sans,serif,display,mono}`. **Oversized editorial numerals** = Instrument Serif
(`--proto-font-display`) 46–84px. **Locked layout:** left rail · top-right glass cluster
(Notifications · Capture · Ask ⌘K) · bottom-center AI bar. `v80-board/` is the richest reference
for tile/card/DnD/focus/AI patterns — copy freely.

**Bklit charts** (if used) — in `@/components/charts`; see `v80-board/tiles.tsx` for correct usage:
fixed-height wrapper + `aspectRatio="" className="h-full"` + **explicit colors**. **Gotchas:**
`AreaChart` is a TIME-series — its x field MUST be a valid **ISO date string** (`new Date(x)`), not a
label like `'W8'` (throws `RangeError: Invalid time value`). `BarChart` (categorical, `xDataKey`)
**keys bars by the `name` value** → names must be **unique** (no duplicate day letters).

**"Fleshed out" bar** — go well beyond wave-1 single-interaction sketches:
- ≥3 genuinely wired interactions, each exercising real state (not a static picture of the idea).
- Real seeded depth (believable multi-item content), plus **empty / hover / active / open** states.
- Keyboard affordances where the pattern implies them (Esc to close, arrows, `/`, ⌘K, etc.).
- Cohesive Press aesthetic; the AI bar should be wired (open/type/send) like v78/v80.

**Self-verify (what an agent can do solo):** `npx tsc --noEmit` clean; walk your own code against
the brief's "must wire" list and confirm each interaction is real. Report: folder path, the wired
interactions, any deviations, and any gotchas. (Central agent registers + browser-verifies +
screenshots after.)

---

## BRIEF v81 · READER — the document end of the spectrum, fully realized
**Board cluster:** "Accessibility Reader / a new reading mode", the multi-column article shots, the
highlighting pin ("Simply long-press and drag… or Apple Pencil"), the text-editor toolbars, "BOOKS".
**Concept (Axis A/B):** Folio says a page with no modules is a flat **document**. Flesh that out into
a first-class **reading & annotation surface** — where Pond reads *with* you.
**Build:** a real long-form page (use `openPage` prose + add ~5 seeded paragraphs) on warm paper,
serif body, generous measure. Must wire:
1. **Select-to-act** — selecting text (track via `window.getSelection`, or simulate with clickable
   sentence spans if selection is fragile in the harness) raises a floating **glass action bar**:
   Highlight · Annotate · Ask Pond · Copy. Highlight persists a colored mark; Annotate adds a
   **margin note**; Ask posts the selection into the AI bar with an inline answer.
2. **Reader settings** — a control (in the cluster) opens a panel: font (serif/sans), size, measure
   width, theme (paper/sepia/night). Changes apply live to the article.
3. **Reading progress** — a slim progress indicator + estimated time; a right-margin outline of the
   article's headings that highlights the current section on scroll.
4. **Pond ambient notes** — 2–3 pre-placed margin annotations from Pond (glass, dismiss/expand).
**Feel:** editorial, calm, generous. Oversized display title; mono kicker for section labels.

## BRIEF v82 · CONSOLE — Pond's dark "operating shell" / power mode
**Board cluster:** the dark terminal screens ("start session / view protocols / check recovery /
system settings"), dark data readouts, radio dials, Modo/DTS brutalist type, mono everything.
**Concept (Axis B/D):** a bold **dark inversion** of Press — same locked layout, inverted palette —
that tests whether Pond has a **command-driven night/power mode**. This is the one variant allowed to
go dark. Invert: base `#1a1815`-ish ink-paper, `CARD` dark, text warm-white, keep `RUST`/`LIME`/`ACCENT`
as accents; glass becomes dark frosted.
**Build:** a monospace-forward console over the same rail/cluster/AI-bar layout. Must wire:
1. **Command console** — a large mono prompt (`>`) that accepts typed commands (`open <page>`,
   `run <action>`, `status`, `focus`, `help`) with a subsequence/prefix filter and a live suggestion
   list; Enter executes and appends to a scrollback log. Full keyboard (↑ history, Esc).
2. **Live dark readouts** — 3–4 dark data panels with oversized mono numerals + a dark-themed chart
   (Bklit line/area with explicit light stroke on dark) or hand-rolled sparkline/dials.
3. **Protocols list** — a "system"-styled list of Pond routines/actions with status dots
   (active/idle), selectable, each runnable from the console.
**Feel:** technical, brutalist, confident. Mono display numerals, tight uppercase labels, sparing accent.

## BRIEF v83 · AGENDA — the time-based planner
**Board cluster:** "Good morning" digests, "My Everyday" task lists, minimal calendars (March 2026),
"Timeblok" timeboxing, week/day toggles, "Today".
**Concept (Axis A/C):** the temporal home that Glance/Board (spatial) don't cover — place Pond's
pages/tasks **in time**. Must wire:
1. **Week ↔ Day toggle** — a segmented control swapping between a 7-column **week planner** and a
   single-day **timeline** (hour rows), animated.
2. **Drag-to-schedule** — an "unscheduled" tray of pages/tasks (from `tree`/`openPage`); drag one onto
   a day column / time slot to place it (HTML5 DnD like v80). Placed items render as timeblocks.
3. **Morning digest** — a top "Good morning" card: what's due today · one Pond suggestion · a
   streak/receipt stat; "Plan my day" auto-arranges the unscheduled tray into the day (staggered).
4. **Minimal month calendar** in the rail (or a peek) with the active day marked; clicking a day
   navigates the planner.
**Feel:** Press paper, oversized date numerals, mono time labels, lime for "now"/primary.

## BRIEF v84 · PLAYER — a Focus-session player from the radio/dial aesthetic
**Board cluster:** radio apps (`094.4`, `103.7`, big dials, play/pause, waveform), PaceBar `28`,
workout timers (`17:20`), Apple-Watch giant numerals, "ANALYSE SLEEP PATTERN".
**Concept (Axis A/D):** reframe the now-playing/radio-dial UI as a **Focus session player** — press
play to run a focus block on a Pond page. Must wire:
1. **Transport** — a big central **play/pause**; on play a session timer counts (use `setInterval`
   via `useEffect`; seed-safe — count up from 00:00, no wall-clock), with a circular progress dial and
   a live waveform/pulse. Pause/resume/stop.
2. **Session picker** — a "dial"/list to choose what you're focusing on (a page from `tree`) and a
   duration (25/50/90). Selecting sets the session context shown in the transport.
3. **Protocols / ambient** — a small set of toggles (ambient sound on/off, "do not disturb", a
   "protocols" checklist for the session) that visibly change state.
4. **Post-session summary** — stopping reveals a summary card (time focused, page, a Pond note),
   Press-styled with oversized numerals.
**Feel:** the boldest numerals in the set (session time at 68–84px), dial/ring motifs, rust progress,
lime transport. Layout held.

---

## Registration + verify (central agent, after all four build)
Add imports + array entries for v81–v84 to `variants/index.tsx` in one edit → `variants: […,v81,v82,v83,v84]`.
Then per variant: `npx tsc --noEmit` clean · load `/proto/visual-language` · pip to it · exercise EACH
"must wire" interaction live · **0 console errors** · screenshot(s) to `wayfinder/screens/r6-v8N-*.png`.
Log results in `HANDOFF-r6-folio-patterns.md` (Wave 3) and update the `pond-v4` memory.
