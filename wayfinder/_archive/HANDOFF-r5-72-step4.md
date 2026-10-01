# HANDOFF — Ledger Step 4: wrap the per-area dashboards in the Folio shell

> **✅ DONE (2026-08-13).** Built via Option A. Added glass/`kbd` tokens to `v72-ledger/ui.tsx`;
> new self-contained `v72-ledger/chrome.tsx` (`<Chrome>` = top-right control cluster + Ask chat +
> ⌘K palette + Capture + Notifications drawer, glass overlays only); wired into `index.tsx`
> (`<Chrome activeAreaId activePageId onNavigate />`, `main` top-padding bumped to clear the fixed
> cluster). ⌘K palette drives the SAME `activeAreaId`/`activePageId` as the rail. `route()` keyword-
> maps captures to the four Ledger areas. **Verified:** tsc clean · ⌘K → switched to Woodworking ·
> Capture "walnut boards…" → "→ Woodworking · Walnut Shelf" · Notifications drawer + Accept · Ask
> chat (seeded transcript, bound to active page) · **0 console errors**. Screens
> `wayfinder/screens/r5-72-shell-{base,palette,notifications,chat}.png`. **Body stayed flat, chrome is
> glass** per the ruling. **Next: Step 5 visual polish** (`/design-review` or `/impeccable`), and
> optional Step 3 (chart tooltips + pie/radar/gauge). Nothing committed; main not pushed.

---

**Goal (Charles, 2026-08-13):** the Ledger dashboards (`#72`) currently render as a
plain rail + charts with NO chrome. Fold in `#71 Folio`'s shell — floating **Ask**
chat, **⌘K** command palette, **Capture**, **Notifications** drawer — so the charts
become the page _body_ inside Folio's frame. Steps 1–3 status below; this is Step 4.

## Where things stand (verified 2026-08-13)

- **Steps 1 & 2 DONE.** `#72 Ledger` = folder `src/app/proto/visual-language/variants/v72-ledger/`:
  - `index.tsx` — interactive rail, `activeAreaId`/`activePageId` useState → `AreaDashboard` switch.
  - `ui.tsx` — palette + `Panel`/`Stat`/`RingsPanel`/`DashboardHeader` + per-domain heatmap ramps.
  - `data.ts` — all seeded history, deterministic LCG (no `Math.random`).
  - `dashboards/{health,work,wood,reading}.tsx` — one chart set per area.
  - `tsc` clean · 0 console errors · screens `wayfinder/screens/r5-72-{health,health-lower,work,wood,reading}.png`.
- **Step 3 (tooltips + more chart types) NOT started.** Optional; can be folded in later.
- **Nothing committed.** `main` is not pushed. Dev server on **:3000** (see AGENTS.md; modified Next 16/Turbopack).
- **3rd Bklit registry bug fixed** in `src/components/charts/bar-chart.tsx` (`yScales.resolveDomain`
  returns `[0, maxValue*1.1]` when `stacked` — stacked bars were overflowing the plot). Keep it.

## The two things to fuse

- **Ledger** `variants/v72-ledger/index.tsx` — its `<View>` is the rail (`<aside>`) + `<main>`
  (renders `<AreaDashboard/>`). This is the BODY.
- **Folio** `variants/v71-folio.tsx` (611 lines, one `View()`), the CHROME. Reusable pieces,
  all `useState` in `View()` ~L261+ (no external deps, self-contained):
  - `paletteOpen` (L272) — ⌘K palette; global key handler **L287–289** (`e.key==='k' && (metaKey||ctrlKey)`), Esc closes. Palette JSX **L546+** ("Jump to a page, or ask Pond…", lists pages + "Ask about…"/"New thought…").
  - `chatOpen`/`chatDraft`/`sent` + `sendChat()` (L271/278/329) — floating **Ask** chat.
  - `captureOpen`/`capDraft`/`caught` + `capture()` (L273/280/330) — **Capture** overlay JSX L587+.
  - `notifOpen` + drawer JSX **L484+**; `acceptEdit()` L320 rewrites the page (uses `diffCard`).
  - Top-right control cluster (Notifications / Capture / Ask buttons) **L414–420**.

## Recommended approach (least churn)

Fusion needs ONE state owner. Two viable shapes — pick per taste:

**Option A (recommended): make Ledger the shell.** Lift Folio's chrome state + the four
overlay/drawer JSX blocks into `v72-ledger/index.tsx`'s `<View>`, keep Ledger's rail and
`<AreaDashboard/>` as the body. Extract Folio's chrome into small components under
`v72-ledger/chrome/` (`CommandPalette`, `AskChat`, `Capture`, `NotificationsDrawer`) so
`index.tsx` stays legible. Wire ⌘K palette page-list to Ledger's `setActiveAreaId`/`setActivePageId`.
This keeps the real Bklit dashboards as the star.

**Option B: make Folio the shell.** Swap Folio's `PageSurface` body for `<AreaDashboard areaId=…/>`
imported from `v72-ledger/dashboards`. More rework (Folio's page-spectrum model ≠ Ledger's area model).

Go with **A**. Reuse Folio's exact glass recipe? NO — Ledger honours the FLAT ruling (charts are
flat panels on warm paper, plain rail). Keep chrome elements (palette, chat, capture, drawer,
top-right buttons) as Folio's warm glass _floating overlays_, but the page body stays flat.
That's the intended contrast: flat dashboard, glass chrome hovering above it.

## Gotchas

- `content.ts` supplies `tree`, `openNodeId`, `diffCard`, `transcript`, `contextLabel` — Folio's
  chrome reads these; Ledger already imports `tree`. Reuse the same.
- The proto's outer switcher also listens for keys (←/→ variant nav). ⌘K is Meta/Ctrl-guarded so it
  won't collide, but TEST that Esc/⌘K in the palette don't leak to the switcher.
- Charts need a sized parent (`aspectRatio="" className="h-full"` in a fixed-height wrapper).

## Verify (same bar as before)

`npx tsc --noEmit` clean · dev **:3000** · load `/proto/visual-language`, **← once** to Ledger
(16/16) · click each area (rail + ⌘K) · open Ask / Capture / Notifications · **0 console errors** ·
screenshot to `wayfinder/screens/r5-72-shell-*.png`. `document.querySelector('main').scrollTop`
to reach lower panels. Update this file + `HANDOFF-r5-fusion.md` + `pond-v4` memory when done.
(Folio ⌘K reference shot: `wayfinder/screens/r5-71-folio-cmdk.png`.)
