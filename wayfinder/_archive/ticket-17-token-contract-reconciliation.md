---
id: 17
label: wayfinder:grilling
status: open
blocked-by: [12, 15]
blocks: []
---

# Lock tokens ↔ registry contract (parallel-track reconciliation)

## Question

The architecture track (taxonomy → registry contract, t12) and the visual track (aesthetic → tokens, t15) run in parallel and must meet cleanly. Once both resolve, reconcile:

- Do modules reference tokens the way the contract assumes, and does the token set cover every surface the modules need (no gaps, no raw values)?
- Any contract change forced by the visual system (e.g. a module needs an elevation/motion hook the contract did not expose)?
- Confirm one real module rendered through real tokens hits the premium bar in Storybook before build begins.
- Sign-off: the visual language, atomic architecture, and AI-facing contract are mutually consistent and specced.

This is the region's **closing gate**. When it resolves, the UI-system region is done charting-and-deciding and execution begins (hand off to impeccable shape → tdd).
