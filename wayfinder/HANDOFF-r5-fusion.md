# HANDOFF — R5 fusion shell (ticket-14 → Atrium → Folio → Ledger)

## ⟶ LATEST: `#72 Ledger` — the "lived-in" cut, on REAL Bklit charts (2026-08-12)
Built `#72 Ledger` — `src/app/proto/visual-language/variants/v72-ledger.tsx`,
registered **last** (position **16/16**; press **←** once from index 0 to wrap to
it). Shows what Pond looks like after months of use: the Health · Marathon Training
area grown dense with seeded history. Typecheck-clean, **0 console errors**, verified
live. Screens: `wayfinder/screens/r5-72-ledger-{top,bottom}.png`.

**What's new / decisions made this task:**
- **Bklit is real and now wired in.** `@bklit` is a shadcn *registry*
  (`https://ui.bklit.com/r/{name}.json`), NOT an npm package — added to
  `components.json > registries`. Installed `line/area/bar/ring/heatmap` charts via
  `npx shadcn@latest add @bklit/<name>` → they live in **`src/components/charts/`**
  (~110 files; deps `@visx/*` + `motion`). API is compositional (recharts-like):
  `<AreaChart data xDataKey><Grid/><Area dataKey/><XAxis/></AreaChart>`; bars use
  `<BarChart xDataKey="name"><Bar dataKey/></BarChart>`; rings
  `<RingChart data size><Ring index/></RingChart>`; heatmap
  `<HeatmapChart data layout="fill" levelColors><HeatmapCells/></HeatmapChart>`
  (data = `HeatmapColumn[]`, each `{ bin, bins: [{ bin, count, date }] }`).
  Charts need a **sized parent** — pass `aspectRatio=""` + `className="h-full"`
  inside a fixed-height wrapper, else `ParentSize` measures 0 and nothing draws.
- **Three Bklit registry bugs fixed on the way in** (would hit any consumer, ticket-13/15):
  1. `chart-loading-label.tsx` imported `../components/shimmering-text` (resolves to
     the non-existent `src/components/components/…`) → changed to
     `@/components/shimmering-text` (the file landed at `src/components/`).
  2. Bklit's `@theme` injection into `globals.css` has the **Tailwind-v4
     double-prefix bug** (`--color-chart-label: var(----chart-label)`, four dashes) —
     so the `text-chart-*` / `--color-chart-*` utilities are dead. The proto sidesteps
     it by passing **explicit Folio colors** to every chart. **This is the ticket-15
     tokens problem in the flesh — resolve before adopting Bklit's theme layer.**
  3. **Stacked vertical `BarChart` overflowed its plot** (2026-08-12, ledger-buildout):
     bars are positioned by `buildYScalesForLines`, whose `resolveDomain` returned the
     max *individual* segment, while the axis `valueScale` used the stacked *sum* — so
     any stack taller than its biggest segment ran off the top. Patched `bar-chart.tsx`
     `yScales.resolveDomain` to return `[0, maxValue*1.1]` when `stacked`.
- **Aesthetic:** reused Folio's earthy palette but honoured the FLAT ruling — charts
  are flat panels on warm paper, areas in a plain rail, no doc↔dashboard slider.

## `#71 Folio` (Charles's clarified product model, supersedes #70)
Charles clarified the model, and it's simpler than #70's four-tab switcher. Built
`#71 Folio` — `src/app/proto/visual-language/variants/v71-folio.tsx`, registered
last (position **15/15**; press **←** once from index 0 to wrap to it).
Typecheck-clean, 0 console errors, every interaction verified live 2026-08-12.

**The clarified model:**
- **Areas → a persistent left rail** (not a "view"). You add **pages + subpages**
  under areas. `＋` on any area adds a page.
- **A page is a spectrum, not a type — the ONLY variable is modules.** No modules →
  a **pure document** (self-contained, flat, exportable, ideally no nested pages);
  all modules → a **dashboard** (placeholder word); anything between is valid. One
  renderer: `text` blocks = flat prose; `todo`/`metric` = distinct glass cards. A
  header **Document——Dashboard meter** shows where a page sits. New pages start as
  pure documents.
- **Timeline → demoted to a Notifications drawer** you open/close (bell in chrome).
  Holds Pond's reflection + the proposed edit; **Accept there rewrites the page**
  (verified: writes diffCard.after into Marathon Training's b4).
- **Relationships → CUT** ("juice ≠ squeeze").
- Kept from Atrium: floating Pond chat · ⌘K (now wired to switch pages) · capture.

Seeded pages span the spectrum to prove it live: *Design System* = pure document,
*Sleep* = pure dashboard, *Marathon/Q3/Walnut Shelf* = in-between.
Screens: `wayfinder/screens/r5-71-folio-*.png` (mixed · document · dashboard · notif
· accepted · written-back · new-page).

**Open / next for Folio:**
- Page editing is read-only (no real block editing / add-module-to-a-page yet — the
  spectrum is shown via seeded pages, not authored). Adding a module to a live page
  to watch the meter move would nail the thesis.
- "dashboard" still wants a better word.
- #70 Atrium left intact for comparison; delete once Folio's direction is confirmed.

---

## (prior) `#70 Atrium` — the four-tab fusion (kept for comparison)

**Status:** The reframe landed. Charles decided the R3/R4 winners aren't competing
aesthetics — they're **different features/views of one product**. Built the first
fusion shell, `#70 Atrium`, that assembles them. Typecheck-clean, zero console
errors, all key interactions verified live. **All four views now built for real**
— Area, Document, Relationships, and Timeline (the last two were stubs; built out
this round and verified live 2026-08-11).

## The reframe (Charles's synthesis)
He numbered by **switcher position** (the `NN/34` counter), not variant id. Mapping
of what each winner becomes in the one product:

| pos | variant | role in the product |
|-----|---------|--------------------|
| 1 | Prism | the **layout/shell** — chat floats *above* the page, page fills the screen |
| 2 | Ma | minimalist **vibe / aesthetic baseline** |
| 3 | Constellation | **Relationships** view (show how things connect) |
| 4 | Command | **⌘K command palette** — a real feature |
| 6 | Current | **Timeline / notification** view |
| 7 | Almanac | **Area** view (an area with several modules) |
| 11 | Catch | **quick capture** |
| 12 | Ink Live | **Document** view (what a document looks like) |

## Atrium (`#70`) — what's built
File: `src/app/proto/visual-language/variants/v70-atrium.tsx` (registered last in
`variants/index.tsx`; position **14/34** in the switcher — from index 0 press **←**
once to wrap straight to it).

Shell model:
- **Canvas** — one earthy cream viewport w/ drifting light (Almanac palette, sage accent).
- **Distinct glass containers** — rounded + drop-shadow + backdrop-blur. Charles's
  words: "distinct containers with drop shadow and rounded corners." `glass` recipe
  + `tile` at top of file.
- **View switcher** (segmented, top center): Area · Document · Relationships · Timeline.
- **Floating chat** — Pond hovers ABOVE the page as a glass dock (bottom center);
  click to expand → transcript + diff card + input. Sits behind the switcher chrome;
  press `h` to hide chrome and see it fully.
- **⌘K command palette** — global overlay (button or ⌘K); warm-glass, Go-to + Ask groups.
- **Capture** — `＋` button; type ↵ → routed to an area (Catch's `route()`), drops a
  "Just captured" chip under the canvas.

Views:
- **Area** (`AreaView`) — the full Almanac bento as distinct containers. ANCHOR, done.
  Brief's suggested edit has a wired Accept.
- **Document** (`DocumentView`) — adapted from `#68 Ink Live`. ⚠️ **FLAT, not a
  container** — Charles: "documents shouldn't be in a container / they should be
  flat." Prose sits directly on the canvas; AI is a right-margin whisper. Accent
  unified to **sage** (not Ink's terracotta). Wired: accept inline suggestion →
  sentence rewrites in place (+ "applied" flush); reject dismisses; click a line →
  typewriter focus dims the rest.
- **Relationships** (`RelationshipsView`) — adapted from `#59 Constellation`, re-lit
  in the earthy palette. ⚠️ **CONTAINER-BOUND** (a bounded "map" object, one glass
  panel — not the flat full-bleed void of the original). Pond hub at centre; areas
  tether to it; projects/routines orbit their area. Wired: click an area or a
  satellite → its tethers + orbit light sage, the rest recede, and a legend strip
  names what connects to what. Data-driven from `tree`; positions in `NODE_POS`.
- **Timeline** (`TimelineView`) — adapted from `#62 Current`. **CONTAINER-BOUND** —
  each moment is a distinct glass card strung along a sage spine (consistent with
  Area's bento, unlike flat Document). Wired: Accept the pending diff in the stream
  → the entry collapses to an applied state (mirrors the Area brief); Reject removes
  it. Reflection · you-asked · proposed-edit · logged-metric+sparkline · tasks ·
  notes · origin.

## Verified live (0 current console errors)
Area render · view switch · ⌘K palette · capture→routing (Walnut Shelf) · floating
chat open · Document render (flat) · Document accept-suggestion (rewrite + focus dim)
· **Relationships render + area re-select (Health→Work: orbit lights, legend
updates)** · **Timeline render + Accept collapses diff to applied**. Screens:
`wayfinder/screens/r5-70-atrium-*.png` (incl. `-relationships`, `-relationships-work`,
`-timeline`, `-timeline-applied`).
Note: the session-wide (`all=true`) console dump shows stale `Can't resolve
./v31-tidepool` compile errors from a much earlier `index.tsx` state — the current
`index.tsx` only imports the 14 surviving variants (v48–v70) and tsc is clean.

## OPEN QUESTION for Charles
- Document's **"Pond suggests" callout** is still a small subtle card. Flatten it too
  (inline/margin note), or leave as an AI affordance card? (asked, not yet answered)

## NEXT STEPS
1. ~~Build Relationships + Timeline~~ — **DONE** (both container-bound; verified live).
2. Resolve the Document callout question above.
3. Wire the ⌘K "Go to" rows + capture destinations to actually switch views
   (currently the palette lists areas but selecting one doesn't navigate; capture
   drops a confirmation chip but doesn't open the destination).
4. Polish passes on the two new views: Relationships could gain hover-preview on
   satellites or pan/zoom; Timeline's Reject currently removes the entry with no undo.

## Standing prefs / harness (unchanged)
- North star **zen**; earthy + curved-container + glass; make it **clear how each UI
  works** + **more interactive** each round.
- Route `/proto/visual-language`; `←/→` cycle (wraps), `1–9` jump, `h` hide chrome.
  Each variant self-contained `'use client'`, inline styles, imports `../content`.
- Modified Next.js 16 (Turbopack) — see root `AGENTS.md`. Cloud-sync `"<name> 2.ts"`
  dupes in `.next` break `tsc`; `rm -rf .next` fixes.
- Dev server runs on **:3000**. Delete `src/app/proto/` once the direction is chosen.
