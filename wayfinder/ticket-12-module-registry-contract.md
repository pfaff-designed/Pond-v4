---
id: 12
label: wayfinder:grilling
status: open
blocked-by: [11]
blocks: [16, 17]
---

# The module registry contract

## Question

The registry is the hinge of the unified system: one map `type → capabilities` that BOTH the UI renders from and the AI composes against. Given the taxonomy (t11), decide what each module type declares:

- **Data schema** — how a module's data is shaped and validated (Zod? matches the persisted `blocks` JSON).
- **View** — the render surface. One renderer, or view/edit/diff variants?
- **Editor** — the in-panel editing affordance (todo checkboxes interactive; text a textarea; metric read-only, per ticket-09).
- **Differ** — type-specific diff visualization for the AI edit loop (full-state todo, preview-only metric, before/after prose — the ticket-10 deferred items).
- **AI capabilities** — the description/schema the AI reads to know when and how to emit or edit this module (feeds t16).
- **Layout / slots** — since chrome is modules too (t11), how does a container module place children? Does the contract carry layout intent?

Decide whether this is a lightweight object-literal registry (3–6 types) or something heavier, and where it physically lives (`src/lib/modules/`?). Resist over-abstraction for a handful of types. Blocks the AI composition contract (t16) and the token↔contract reconciliation (t17).
