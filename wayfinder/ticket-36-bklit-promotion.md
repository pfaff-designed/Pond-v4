---
id: 36
label: cycle-3:vocabulary
status: resolved
blocked-by: []
blocks: []
---

# Promote the Bklit chart library into the module registry (finding F13)

Only metric/metric-ring are AI-reachable; the Bklit set in
src/components/charts/ (line, bar, area, heatmap, stat variants — survey what
exists) is proto-only. Promote a curated FIRST SET — line, bar, and ONE more
that earns it (heatmap if data shape is sane) — as registry modules:
`chart-line`, `chart-bar`, etc. Zod data schema per type (series/points/labels
— design for hand-authorable + AI-emittable data; keep small), view wrapping
the existing Bklit component in module-card chrome (w2-design-brief.md),
serialize (honest text summary: series names + ranges/last values), catalog
teaching with when-to-use ("trend over time → line; comparison → bar; NOT for
3 numbers — use metrics"). CLEANUP MANDATE: the promoted chart files must be
brought to lint-clean; delete or fix any charts/ files that remain unused by
proto pages if cheap — goal is shrinking the ~80-problem baseline (report the
before/after count). Stories + story tests per chart at editor width. Empty/
degenerate data states never crash.

Token regime: jest+story proof only, no dev server; no research (brief has the
design). Resolution + status: resolved (note which Bklit pieces were NOT
promoted and why).

## Resolution

Promoted set: **chart-line, chart-bar, chart-area** as registry modules.
Area earned the third slot over heatmap: it reuses the identical time-series
data contract as line (no new 2D-matrix schema, no heatmap-context subsystem),
so it was cheap to promote and reason about.

**Data contract** — one shared point-major shape (`src/lib/modules/chart/data.ts`):
`points: [{ x: string, values: { <seriesName>: number } }]` plus optional
`title/caption/xLabel/yLabel`. Hand-authorable and AI-emittable; `toChartRows()`
maps it to Bklit's flat row shape at the module boundary so the AI never emits
Bklit's wide positional shape. Series derived from the union of value keys;
missing values render as gaps, not zeros. `summarizeChart()` gives the honest
serialize: kind + title + point count + per-series range and last value.

**Chrome** — shared `ChartCard` (`src/lib/modules/chart/card.tsx`): kicker title,
muted caption, legend + axis labels in the mono-kicker voice, calm "No data yet"
empty state (empty/degenerate data never crashes — story-tested). Views are
read-only (AI-maintained, like metric) with animation off for determinism.
Wired into all four registries (registry / renderers / content union /
ai-composition data + createPageBlock unions) with appended-only edits for clean
keep-both merges with t35/t38. Catalog teaching: trend→line, category
comparison→bar, magnitude/volume→area, "NOT for 2–3 numbers — use metric".

**Lint mandate** — repo-wide **79 → 53 problems** (49→28 errors, 30→25
warnings). All 26 problems in the promoted transitive set (55 files reachable
from line/bar/area) fixed: the six local `type CurveFactory = any` replaced
with the real d3-shape `CurveFactory` type, unused scale type params dropped,
and the intentional react-hooks patterns (latest-ref idiom, guarded phase-machine
setState, caller-supplied deps, render-time edge detectors) ported from dead
`biome-ignore` comments to justified `eslint-disable-next-line`. The remaining
53 problems all live in UN-promoted files: 29 in charts/ (heatmap/tooltip/
scatter/candlestick/brush) and 24 in the v85 proto pages — out of scope here.

**NOT promoted, and why:**

- **heatmap/** (19-file subsystem, own context/legend/tooltip): needs a 2D
  matrix data schema + color-scale vocabulary — real new schema surface, fails
  the "data shape is sane" bar for a first set.
- **ring-chart/ring**: overlaps the existing `metric-ring` module; promoting it
  would create two competing ring vocabularies for the AI.
- **stat variants (chart-stat-flow), tooltip/, projection/brush/scatter/
  candlestick/bar-squares/pattern/depth layers**: interactive/decorative
  chrome, not content modules — no AI-composition story yet.
- Un-promoted charts/ files were NOT deleted: heavily interwoven with the
  promoted files' import graph (tooltip/context/phase modules are shared), so
  deletion wasn't cheap; they remain for a later cut.

Infra note: Bklit pulls `@visx → d3-shape` (pure ESM) which next/jest won't
transpile, so the chart entry modules are stubbed in jsdom jest
(`src/__mocks__/charts.tsx`, first-match mapper in jest.config.ts — matched on
resolved path tail, not the `@/` alias, which next resolves before the mapper).
Real render is proven by the Storybook story tests (8 tests, 3 files, editor
width). Validation: tsc 0, jest 553/553 (44 suites), test-storybook 125/125
(27 files).
