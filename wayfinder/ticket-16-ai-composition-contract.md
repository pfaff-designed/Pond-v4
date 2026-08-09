---
id: 16
label: wayfinder:grilling
status: open
blocked-by: [12]
blocks: []
---

# AI module-composition contract

## Question

Give the AI the ability to properly use the components to _create_ things — the second half of the goal. Given the registry contract (t12), decide:

- Tool surface: generalize today's text-only `propose_edit` into typed-module payloads and add create/compose operations — or separate tools per operation (create_module / edit_module / compose_page)?
- Catalog-teaching: is the system prompt generated from the registry's AI-capability descriptions so a new module type auto-teaches the AI?
- Composition: how does the AI assemble multiple modules into a page/section while honoring "AI produces only on explicit request" and "never emits modules unprompted" (ticket-06, ticket-09)?
- Diff/review: how typed diff cards (t12 differ) present multi-module proposals in the terminal for Accept/Reject/Edit (extends ticket-10).
- Validation/safety: rejecting malformed AI output against module schemas before it reaches the panel.

Uses the current chat route + `propose_edit` tool and AITerminal/DiffCard as incumbent authority.
