---
id: 36
label: cycle-3:vocabulary
status: open
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
