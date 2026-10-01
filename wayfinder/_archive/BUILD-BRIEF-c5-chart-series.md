# BUILD BRIEF — C5: Chart context drift-proofing + `useSeriesRendering`

**Status:** SPEC-READY (grilled 2026-09-12). Build in a fresh/orchestrated session off `main`.
**Origin:** Arch review candidate #5 (see [[project-pond-arch-review]]). Candidate #4 (metric resolver) was evaluated + skipped and redirected here.
**Reconstruction note:** the prior session's `HANDOFF-c5-spec-ready.md` was never written to disk; this brief was rebuilt from the code on `main` + a fresh grill. All decisions below are confirmed by the user.

---

## Scope (decision 1)

Ship **Part B** (`useSeriesRendering`) **+ narrow Part A** (fix `squareSnap` + drift-proof the enumeration).
**Deferred to a later candidate:** the full per-chart-type context split (breaking the ~40-field `ChartContextValue` union into type-specific contexts). High blast radius, mostly-architectural payoff — not worth it now.

Everything here is **zero-observable-behavior-change** in the running app (see the `squareSnap` fact below).

---

## Part A — drift-proof the chart context (decision 2 → option **a**)

### The confirmed bug

`squareSnap` is declared on `ChartContextValue` (`src/components/charts/chart-context.tsx:195`) and read at `src/components/charts/tooltip/chart-tooltip.tsx:139` via `useChart()`. But `ChartProvider`'s stable memo (`chart-context.tsx:237–282`, body **and** dep array) **never copies it**, and the hover slice doesn't either. `bar-chart.tsx:598` puts it into `contextValue` → `<ChartProvider>` (`bar-chart.tsx:602`) → it is silently dropped → tooltip reads `undefined`. The `squareSnap?.groupGap ?? (seriesCount > 1 ? 4 : 0)` fallback (`chart-tooltip.tsx:150`) masks it. This is the triple-enumeration drift failure mode, live in prod.

### Key fact — the feature is dormant

**No app-level caller passes `squareSnap`.** `grep` over `src/lib/modules` + `src/app` finds zero `<BarChart squareSnap=…>`. It is declared and internally threaded inside `bar-chart.tsx` only. So fixing it is pure correctness/wiring — **no observable change today**; it only matters if the square-snap variant is lit up later.

### Why not the "spread `value` minus hover keys" approach

`bar-chart.tsx:563` rebuilds `contextValue` inline **every render**. The stable memo therefore **cannot** depend on `value` (would bust on every hover and defeat the stable/hover split's entire purpose). It must depend on individual field identities. This rules out `useMemo(() => stable, [value])`.

### The fix (option a — compile-time guard, runtime byte-identical)

1. Add `squareSnap` to the stable memo **body and dep array** in `ChartProvider` (`chart-context.tsx:237–327`). This alone fixes the bug.
2. Add a **compile-time exhaustiveness assertion** that the stable memo body covers every non-hover key of `ChartContextValue`. Any future omission becomes a **typecheck failure**. Sketch:

   ```ts
   // The 8 volatile hover keys — the ONE canonical list.
   type HoverKey = keyof ChartHoverContextValue
   // Every non-hover key of the full context = what the stable slice must contain.
   type RequiredStableKey = Exclude<keyof ChartContextValue, HoverKey>
   // Assert the stable object literal's keys cover RequiredStableKey exhaustively.
   // e.g. type the memo result as Record<RequiredStableKey, unknown>-compatible,
   // or: type _Guard = Exclude<RequiredStableKey, keyof typeof stable> extends never
   //       ? true : ['stable slice missing keys:', Exclude<RequiredStableKey, keyof typeof stable>]
   ```

   NB: typing the memo as `ChartStableContextValue` is **not** sufficient — TS does not error on missing **optional** properties (that's exactly why `squareSnap` compiled while absent). The guard must force presence of all keys, optional included.

**Runtime stays byte-identical** except `squareSnap` now flows through. The guard is the _proof the fix landed_ (won't compile if the field is absent).

**Known limitation (accepted):** the guard catches "field absent from body." It does not catch the subtler "in body but missing from dep array" staleness case. That's the less-damaging failure, and body/deps are edited together. Out of scope.

---

## Part B — `useSeriesRendering` (decision 3 → option **c**)

Line (`src/components/charts/line.tsx`, 381 LOC) and Area (`src/components/charts/area.tsx`, 348 LOC) share their **setup** but diverge in **rendering**. Extract the shared setup into one hook; leave path/fill/animation local.

### Hook owns (shared setup)

- Context reads via `useChartStable()`: `data, renderData, xScale, innerWidth, innerHeight, xAccessor, lines, chartPhase, notifyLoadingPulseComplete` (+ `yDomainTweenDuration`, which Line needs and Area doesn't — return it; Area ignores it).
- `yScale = useYScale(yAxisId)`
- `seriesIndex` (`lines.findIndex(l => l.dataKey === dataKey)`, fallback 0) — identical in both.
- `getY` callback (`typeof value === 'number' ? yScale(value) ?? 0 : 0`) — identical.
- `hasDashTail = resolveDashTailBounds(dashFromIndex, data.length)` — identical (already a pure fn in `path-stroke-utils`).
- The **loading-pulse state machine** (`pulseMode` formula + `showLoadingPulse` + `pulseEpoch` state + `handleLoadingPulseComplete` with loop-timeout + `notifyLoadingPulseComplete`). Currently duplicated: inlined in Line (`line.tsx:245–261`), extracted-but-unshared in Area (`useAreaLoadingPulseState`, `area.tsx:94–125`). Promote to the shared hook; accept an optional `onCycleComplete` so Line's `onLoadingPulseCycleComplete` fits (Area passes nothing).
- `showSeriesContent` phase flag (`chartPhase === 'revealing' | 'ready' | 'exitingReady'`) — same predicate in both (`line.tsx:292–293` `showSeriesStroke`; `area.tsx:104–105` `showSeriesContent`).

### Hook does NOT own (stays local — genuinely divergent)

- **Line:** `useAnimatedSeriesPath` data-transition tween + `useDataTransitionPath` + `animatedPathD` (Line-only); `effectiveShowHighlight = showHighlight && !showLoadingPulse`.
- **Area:** `AreaClosed` + `AreaGradientDefs` + `showLine` / `showAreaFill` / `isPatternFill` / `resolvedStroke` / edge-mask; `highlightEnabled` (its 4-way `&&`); `shouldMeasurePath`.
- `usePathStrokeMetrics` — **stays in each component** (dep arrays genuinely differ: Line deps on `animate`/`animatedPathD`; Area on `showLine`/`showSeriesContent`/`showLoadingPulse`).
- `fadeEdges` **prop defaults stay per-component** (Line `true`, Area `false`).
- `useId` gradient IDs — stay local (Area needs 4 IDs, Line needs 1).

### Pure functions to extract (feeds decision 4)

Pull the two decisional bits out as pure, side-effect-free functions the hook composes:

- `resolveSeriesPulseMode(chartPhase, loading, loadingPulseMode): LineLoadingPulseMode | null`
  — the `loading === false ? null : (loadingPulseMode ?? (loading === true ? 'loop' : resolveLineLoadingPulseMode(chartPhase)))` formula.
- `isSeriesContentVisible(chartPhase): boolean`
  — `chartPhase === 'revealing' || 'ready' || 'exitingReady'`.
- (`resolveDashTailBounds` already pure — reuse.)

Suggested location: co-locate with the hook (`use-series-rendering.ts`) or in a small `series-render-state.ts`; builder's call.

### Watch-outs (do not regress)

- Line's `handleLoadingPulseComplete` fires `onLoadingPulseCycleComplete?.()` **before** the loop/notify branch (`line.tsx:252–261`). Area's does not. The shared hook's `onCycleComplete` must reproduce Line's ordering exactly.
- Area's pulse hook currently omits `onLoadingPulseCycleComplete` entirely — that's fine (Area's public API has no such prop). Don't add it to Area.
- Preserve each component's exact `usePathStrokeMetrics` dependency list — do **not** unify them.

---

## Tests (decision 4 → option **a**)

Repo convention (`jest.config.mjs:26`): pure logic → jsdom unit tests; **chart real-render → Storybook story tests**. Respect it.

- **New jsdom unit tests** for the extracted pure fns: `resolveSeriesPulseMode` (every `loading` × `loadingPulseMode` × representative `chartPhase`) and `isSeriesContentVisible` (all phases). First real logic tests for charts.
- **Composed rendering** verified by the **existing** `chart-line` / `chart-area` / `chart-bar` Storybook story tests (`src/lib/modules/chart-*/view.stories.tsx`) — must pass unchanged.
- **No** new standalone SVG-render jest harness (contradicts the repo's deliberate "real render → Storybook" split; separate ticket if ever).

---

## Acceptance gate (decision 5 → option **a**, no extra story)

Ship only when ALL hold:

1. **tsc clean**, incl. the new exhaustiveness guard compiling (this _is_ the proof the `squareSnap` fix landed).
2. **Full jest suite green** (~1436 baseline from C3) **+ new pure-fn unit tests** pass.
3. **Storybook story tests pass unchanged** for `chart-line` / `chart-area` / `chart-bar`.
4. **Live browser pass** — line, area, bar charts render + hover **identically to `main`** (the real zero-behavior-change check; no render unit tests exist).
5. **`/code-review` both axes** (Standards + Spec) clean.

**No square-snap story/test** — feature is dormant; the compile guard proves propagation; adding UI for an unused feature is out of scope. If someone lights up `squareSnap` later, they add coverage then.

---

## Packaging (decision 6 → option **a**)

- **Single branch** `refactor/c5-chart-series` off `main`.
- **Two commits:**
  1. `refactor(charts): drift-proof chart context + fix squareSnap propagation`
  2. `refactor(charts): extract useSeriesRendering shared setup from Line/Area`
- One `/code-review`, one PR.
- **Build later** via the orchestrator pattern ([[feedback-orchestrator-pattern]]) — Opus orchestrates, Fable builds in a worktree, orchestrator reviews + live-verifies + ships. **Not** inline.
- Lockfile `node 22` gotcha ([[reference-pond-lockfile-node22]]): C5 adds **no deps**, so likely moot — noted for safety only.

---

## File anchors (as-built on `main`, 2026-09-12)

- `src/components/charts/chart-context.tsx` — `ChartContextValue` (`:114–212`), `ChartHoverContextValue` (`:90–112`), `ChartProvider` stable memo (`:237–327`), `squareSnap` decl (`:195`).
- `src/components/charts/bar-chart.tsx` — `contextValue` build (`:563–599`), `squareSnap` in value (`:598`), `<ChartProvider>` (`:602`).
- `src/components/charts/tooltip/chart-tooltip.tsx:139,150` — `squareSnap` read via `useChart()`.
- `src/components/charts/line.tsx` — pulse state (`:245–261`), `seriesIndex` (`:263–266`), `getY` (`:280–286`).
- `src/components/charts/area.tsx` — `useAreaLoadingPulseState` (`:94–125`), `seriesIndex` (`:173–176`), `getY` (`:202–208`).
- `src/components/charts/path-stroke-utils.ts` — `resolveDashTailBounds`, `usePathStrokeMetrics`.
