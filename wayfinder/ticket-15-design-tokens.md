---
id: 15
label: wayfinder:grilling
status: open
blocked-by: [14]
blocks: [17]
---

# Design token architecture

## Question

With the visual language set (t14), define the token layer that feeds Tailwind, Shadcn, and Bklit:

- Token categories and structure: color (semantic + palette), typography (scale, families), spacing, radius, elevation/shadow, motion primitives.
- How tokens express through Tailwind v4 + Shadcn theming + Bklit as one source of truth, no drift (the familiar make-noise tokens problem).
- Theming: is dark mode / multi-theme in scope now or fog? Light-first?
- Naming and semantic layering so modules reference intent (`surface`, `accent`) not raw values.

Reconciles with the registry contract at t17 (tokens ↔ contract lock together). Uses any existing token/theme setup as incumbent authority; audit with impeccable's token audit.
