---
id: 43
label: cycle-4:infra
status: open
blocked-by: []
blocks: []
---

# A sandbox workspace for orchestrator testing (user directive)

## Problem

The orchestrator's live verification passes run against the user's REAL
workspace + route (`/workspace`), so test pages land in the user's tree and
risk touching real content (Kitchen Remodel, Weight Loss Program, etc.). The
user wants a separate sandbox to test in.

## Direction

A separate, isolated workspace the orchestrator (and the user, if they want)
can hammer without touching real data:

- **Route**: `/sandbox` (or `/workspace?ws=sandbox`) mounting the SAME workspace
  UI (rail + overview + editor + terminal) against a SEPARATE data scope.
- **Data isolation**: the cleanest approach given single-user Supabase — a
  `workspace` discriminator on `pages`/`conversations` (default `'main'`,
  sandbox `'sandbox'`), OR a dedicated seed set under a reserved root. Pick the
  approach that does NOT risk leaking sandbox rows into the real overview/rail
  counts and needs the smallest migration (document the choice). RLS/user stays
  the same (one account); the split is logical, not auth.
- **Reset**: a "Reset sandbox" action (wipes sandbox rows, re-seeds a small
  fixture: a couple of areas + a demo page) so tests start clean.
- **Visually marked** as the sandbox (a quiet banner/label) so it's never
  mistaken for the real workspace.
- The real `/workspace` behavior is UNCHANGED.

## Rules (token regime)

jest+story proof (data-scope filtering, reset logic, route mount); a DB
migration is acceptable here (the one ticket where it's warranted) — keep it
additive + reversible. Touched-files lint clean. Resolution + status: resolved.
Note for orchestrator: after this merges, ALL future live passes use /sandbox.
