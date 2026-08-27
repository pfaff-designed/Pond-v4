---
id: 23
label: ux-audit:finding
status: open
blocked-by: []
blocks: []
---

# "Live data" isn't live — the same fact exists three times, unconnected

## Problem

Fall Reading List (AI-created, 2026-08-27) seeded the same three books as:

1. a **table module** with a Status column ("To Read"),
2. a **checklist** of the same three titles,
3. a **"Books Finished" metric** at 0.

Checking off "Dune" in the checklist changed nothing else: metric stayed
`0 books`, table still "To Read". The metric's `→` affordance does nothing at
all. Same pattern on the 3-Day routine page (checklist of weeks + two manual
metrics, unbound).

This undercuts the core product promise — dashboards over *live* data. Three
representations, three sources of truth, all manual.

## Direction (not yet designed — grill before build)

This is the most product-defining ticket of the audit set; run /grill-me on it.
The branches:

- **Derived modules**: a metric that *binds* to another block (count of checked
  items in checklist X; count of table rows where Status = Read). Needs a
  reference/expression shape in the metric schema — a real extension of the
  t12/t16 contract, and the compelling product move.
- **Authoring discipline instead**: teach the AI to pick ONE canonical
  structure per fact (table with status OR checklist + derived count, never
  both). Cheaper, avoids the binding machinery, but forfeits the live-dashboard
  story.
- Likely both: discipline now (fold into ticket-21's catalog work), bindings as
  the designed follow-up.
- Decide the `→` affordance on metric: link-to-source, manual increment, or
  remove until bindings exist. A dead control reads as broken.

## Origin

Hands-on UX audit, 2026-08-27 (`~/ux-06-created-page.png`). Reproduce: Personal
→ Fall Reading List, check any box.
