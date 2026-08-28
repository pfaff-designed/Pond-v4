---
id: 32
label: cycle-2:second-brain
status: open
blocked-by: []
blocks: []
---

# The conversation surface reads "developer console," not "luxury thinking partner"

## Problem

Audit finding 3 (major, aesthetic verdict): document/home surfaces are
genuinely premium (paper, editorial serif, sage accents) but the AI terminal is
a monospace slab — the product's most important surface is its cheapest. Split
typographic personality; the two halves don't feel like one object.

Finding 11: 25–30s generations show only "…" — no stage feedback.

## Direction (audit's boldest upgrade #1 — go further)

- Reskin the terminal as a **conversation**: same serif/paper system as the
  document; AI replies as letterpress-style cards with sage accenting; user
  messages quiet and distinct; replies fade+rise in.
- AI-generated structured content in replies renders in the SAME visual
  language as saved page blocks (tables/lists via the module renderers where
  feasible).
- Long generations stream stage text ("drafting your budget table…") — derive
  from tool-call events already visible to the client.
- Keep ALL shipped ergonomics: drawer resize/collapse/auto-grow (t24), ⌘K,
  Clear, proposal cards + resolutions (t19), context label. The terminal
  input can stay quietly monospace if it earns its place — the transcript
  cannot.

## Rules (cycle 2)
Front-end flagship → mobbin (premium AI chat / journal patterns), impeccable,
design-knowledge REQUIRED; aesthetic mandate: bolder than bold, luxury, zen —
this ticket is the proving ground. Live Playwright verify + screenshots.
/code-review.

## Origin
Cycle-2 audit findings 3 + 11 + aesthetic verdict.
