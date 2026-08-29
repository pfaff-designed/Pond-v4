---
id: 35
label: cycle-3:vocabulary
status: open
blocked-by: []
blocks: []
---

# Kanban board module (finding F4)

Registry gains a `kanban` module: columns + cards. Schema (t12: Zod single
source): columns [{id, title, cards: [{id, title, note?}]}]. Facets: view
(drag card between columns via pointer events — no new dep; add/edit/archive
card; add/rename column), serialize (honest text: per-column counts + card
titles), preview. AI-composable per t16 (catalog when-to-use: "workflow with
stages — use ONE kanban per workflow, not kanban + checklist for the same
tasks"); full-state emit is fine at this scale (ops-patch stays deferred per
map fog). bindKey-able as a metric source later is OUT of scope (needs a
kanban-count kind — note as deferred). Design per w2-design-brief.md; builder
may take ONE short mobbin look (≤5 searches) for board interaction detail.
Stories + story tests (drag via play fn if feasible, else jest the pure
move logic; long titles; empty board; add flows). Empty starting state for
manual creation (t37): 3 columns To do/Doing/Done, no cards.

Token regime: jest+story proof only, no dev server; touched-files lint clean.
Resolution + status: resolved.
