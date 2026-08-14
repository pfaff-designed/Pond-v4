# HANDOFF — build out `#72 Ledger` into a per-section prototype

**Goal (Charles, 2026-08-12):** grow the Ledger proto so **every area/section has its
own lived-in dashboard**, wired behind the left rail, and eventually wrapped in the
Folio shell. Build in the order below; each step is independently shippable + verifiable.
Still a static mockup — seeded data, no backend.

## Progress log
- **2026-08-12 — Steps 1 & 2 DONE.** Split `v72-ledger.tsx` → `variants/v72-ledger/`
  folder: `index.tsx` (interactive rail + `activeAreaId`/`activePageId` useState →
  `AreaDashboard` switch), `ui.tsx` (palette + fonts + `Panel`/`Stat`/`RingsPanel`/
  `DashboardHeader` + per-domain heatmap ramps), `data.ts` (all seeded history,
  deterministic LCG — no `Math.random`), `dashboards/{health,work,wood,reading}.tsx`.
  Flat file deleted. All four areas have believable chart sets (Work=SKY burn-down/
  throughput/task-states/cycle-time/commit-heatmap; Wood=CLAY hours/board-feet/
  cut-list/rings/shop-heatmap; Reading=GOLD pace/books/genre-mix/rings/streak/now-reading).
  `tsc` clean · 0 console errors · screens in `wayfinder/screens/r5-72-{health,health-lower,work,wood,reading}.png`.
  **NEXT: Step 3 (tooltips + more chart types), then Step 4 (Folio shell), Step 5 (polish).**
  **→ Step 4 has its own focused handoff: `wayfinder/HANDOFF-r5-72-step4.md` (fuse Folio's
  chat/⌘K/capture/notifications chrome onto the flat dashboards). Start there next session.**
- **Bklit fix (3rd registry bug):** stacked vertical `BarChart` overflowed the plot —
  bars are *positioned* by `buildYScalesForLines` whose `resolveDomain` returned the max
  *individual* segment, while the axis `valueScale` used the stacked *sum*. Patched
  `bar-chart.tsx` `yScales` `resolveDomain` to return `[0, maxValue*1.1]` when `stacked`.
  Fixes genre-mix, session-mix, task-states, cut-list. (Was latent in the "DONE" Health cut.)

## Ground truth (already done — don't redo)
- `#72 Ledger` = `src/app/proto/visual-language/variants/v72-ledger/` (folder; pos 16/16).
  Interactive rail switches a dashboard per area on the real Bklit charts.
- **Bklit is installed** (shadcn registry `@bklit` in `components.json`; charts in
  `src/components/charts/`). Installed types: **line, area, bar, ring, heatmap**.
- Two Bklit registry bugs already fixed (shimmering-text import; note the dead
  `text-chart-*` theme utils from the `var(----x)` double-prefix bug — **pass explicit
  colors, never rely on Bklit's CSS-var theme**). See `HANDOFF-r5-fusion.md`.

## Reusable Bklit API cheatsheet (from generated source)
```tsx
// time-series (date can be a Date or a string). Charts need a SIZED parent →
// aspectRatio="" + className="h-full" inside a fixed-height wrapper, else ParentSize=0.
<AreaChart data xDataKey="date" margin={M} aspectRatio="" className="h-full">
  <Grid stroke={LINE} numTicksRows={4} />
  <Area dataKey="mi" fill={ACCENT} fillOpacity={0.16} stroke={ACCENT} strokeWidth={2.5}
        dashFromIndex={n} />        {/* dashed projection tail */}
  <XAxis numTicks={5} />
  {/* <ChartTooltip /> — see tooltips step */}
</AreaChart>

<BarChart data xDataKey="name" stacked stackGap={2} margin={M} aspectRatio="" className="h-full">
  <Grid .../><Bar dataKey="easy" fill="#c7d0ba" stroke={ACCENT} /><BarXAxis maxLabels={12} />
</BarChart>

<RingChart data={RingData[]} size={168} strokeWidth={13} ringGap={7} baseInnerRadius={28}>
  <Ring index={0} /><Ring index={1} /> …            {/* RingData {label,value,maxValue,color?} */}
</RingChart>

<div style={{height:132}}>
  <HeatmapChart data={HeatmapColumn[]} layout="fill" levelColors={FIVE} gap={3}>
    <HeatmapCells cornerRadius={2} />               {/* col {bin,bins:[{bin,count,date}]} */}
  </HeatmapChart>
</div>
```
Imports: `@/components/charts/{area-chart,line-chart}` (re-export Area/Line),
`{bar-chart}`+`{bar}`, `{grid}`, `{x-axis}`, `{bar-x-axis}`, `{ring-chart}`+`{ring}`,
`@/components/charts/heatmap` (barrel). Palette in v72: ACCENT `#5f7355`, CLAY `#a8613c`,
GOLD `#c99a3f`, SKY `#5f7d8c`, LINE `rgba(42,39,34,0.10)`, PAPER `#efeae0`, INK `#2a2722`.

## Build order

### 1 · Make the rail interactive (foundation)
Refactor `v72-ledger.tsx`: lift `activeAreaId` into `useState` (default `'health'`);
clicking a rail area/page sets it; `<main>` renders `<AreaDashboard areaId=…/>`. Extract
the current Marathon content into a `HealthDashboard`. Keep `Panel`/`Stat`/palette shared
(consider a small `v72-ledger/` folder: `index.tsx` shell + `dashboards/*.tsx` + `data.ts`
+ `ui.tsx`). Verify each area click swaps the surface.

### 2 · A dashboard per area (the ask — "a prototype for each section")
Give each seeded area its own believable chart set (variety per domain):
- **Health / Marathon** — DONE (mileage area+projection, volume bars, session-mix stack,
  resting-HR line, sleep area, goal rings, consistency heatmap).
- **Work** (Q3 Planning · Design System) — **burn-down** LineChart (dashed remaining),
  **throughput/week** BarChart, **milestones** RingChart (3/5), **task states** stacked bar
  (todo/doing/done), **cycle-time** area. Kicker copy: sprints, PRs, "on track".
- **Woodworking** (Walnut Shelf) — project-log flavor: **board-feet used** BarChart,
  **hours logged/week** area, **finish coats** RingChart (2/3), **cut-list progress**
  stacked bar, a **shop-time heatmap**. Warmer CLAY-led palette.
- **Reading** — **pages/week** LineChart (data already in v72), **books finished/month**
  BarChart, **pace vs goal** RingChart, **genre mix** stacked bar (or install pie), a
  **reading-streak heatmap**. GOLD-led.
Each dashboard: same flat-panel language, ~4 stat tiles + 5–7 chart panels, seeded
deterministically (no `Math.random`). Verify tsc + screenshot each.

### 3 · Tooltips + more chart variety (interactivity)
Add `<ChartTooltip />` (`@/components/charts/tooltip`) to the time-series charts for hover
read-outs. If more types wanted: `npx shadcn@latest add @bklit/{pie,radar,gauge,scatter}-chart`
(same registry; watch for the same theme/util caveat). Good fits: pie/radar for Reading
genre mix, gauge for a single goal, scatter for pace-vs-HR.

### 4 · Wrap in the Folio shell (make it feel like the app)
Fold in `#71 Folio`'s chrome (`v71-folio.tsx`): floating chat, ⌘K palette (switch areas),
quick-capture, notifications drawer. Reuse its patterns; keep charts as the page body.

### 5 · Visual polish pass
Hierarchy/density/spacing/color balance across panels; consistent chart heights; make it
read premium. `/design-review` or `/impeccable` fits here.

## Verify each step
`npx tsc --noEmit` clean · dev server already on **:3000** · load `/proto/visual-language`,
**←** once from index 0 to reach Ledger · screenshot to `wayfinder/screens/r5-72-*.png` ·
**0 console errors**. Scroll `<main>` (internal scroll) via `document.querySelector('main').scrollTop`
to capture lower panels. Update this file + `HANDOFF-r5-fusion.md` + `pond-v4` memory as you go.
(Modified Next.js 16 / Turbopack — root `AGENTS.md`; `rm -rf .next` if cloud-sync `"<name> 2.ts"` dupes break `tsc`.)
