---
id: 31
label: cycle-2:second-brain
status: open
blocked-by: []
blocks: []
---

# Living numbers: metrics that lie, tables that don't add

## Problem

Audit finding 1 (major): the AI created "Milestones Complete — 0 of 4" as an
UNBOUND metric; checking items changed nothing — a static number that silently
lies. Root cause: ticket-23's documented boundary (bindings target existing
blocks only; same-batch ids don't exist at emit time), so the AI cannot bind
the metric to the checklist it creates in the same page.

Finding 12: a 16-row "Budget Planner" table has no totals — the math lives
only in chat, never on the page.

## Direction

1. **Same-batch bindings** — symbolic refs: let a create op reference an
   earlier op in the same changes[] batch (e.g. source.ref = op index or a
   batch-local key); the client resolves refs to real ids at accept time when
   it mints them. Update the t16 schema + accept path + catalog teaching, so
   the AI binds metrics it creates with their checklists. (This closes t23's
   deferred item.)
2. **Table numeric intelligence** — a table module option (sum footer over a
   numeric column; parse "$459 (bought!)" leniently); AI taught to enable it
   for budget-shaped tables. Stat-chip rollups optional stretch.
3. **Bound metrics animate** — count-up on change (number-flow dep already in
   package.json).

## Rules (cycle 2)
Front-end + functionality → mobbin/impeccable/design-knowledge for the footer +
metric treatment; live Playwright verify (create plan page via AI → metric
bound → check item → metric ticks; table shows sum). /code-review.

## Origin
Cycle-2 audit findings 1 + 12; closes ticket-23 deferred same-batch binding.
