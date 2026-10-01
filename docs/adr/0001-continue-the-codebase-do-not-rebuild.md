# ADR 0001 — Continue the codebase; do not rebuild

- **Status:** Accepted
- **Date:** 2026-09-29 (decided), 2026-09-30 (promoted to an ADR)
- **Deciders:** the user, on the evidence below
- **Supersedes:** nothing
- **Evidence:** `wayfinder/BUILD-VS-REBUILD-EVAL.md`

## Context

`wayfinder/design_handoff_pond/` is a complete, high-fidelity specification for the whole Pond
product in the Make Noise design language. The first gap analysis against it
(`wayfinder/GAP-ANALYSIS.md`) read as "not greenfield and not close to done," which raised a real
question: is it cheaper to rebuild Pond against the spec than to walk the existing codebase toward
it?

The question needed settling once, with evidence, because it was being re-opened in session after
session — and each re-opening cost a day and changed nothing.

## Decision

**Continue the codebase. Reskin and extend it. Do not rebuild.**

Where a single surface genuinely needs replacing, replace **that surface's layer** and keep the
engine underneath it.

## Why

A 15-agent evaluation scored ~50 surfaces across all 7 spec sections against the real code. Each
section was mapped and scored, then adversarially verified by a pass whose explicit job was to
overturn the verdict.

- **Zero surfaces earned a full "rebuild" verdict.** The strongest adverse calls are seven
  `rebuild-surface` verdicts — durable trash, unified session-undo, threads-as-a-database,
  deep-research, the source picker, the selection bar, and first-run — and every one rebuilds a
  surface _on top of a retained backbone_.
- **Continue ~104 eng-days vs rebuild ~136.** Rebuild costs ~32 more days (~31%) and buys nothing
  continue cannot reach. The delta sits exactly where the backbone is expensive and correct: shell
  (8 vs 3), PondRail (6 vs 3), record-pages (5 vs 3), diff-card (6 vs 4). Net-new surfaces cost the
  same on both paths, so the whole delta is waste on the rebuild side.
- **It is not sunk-cost reasoning.** The verdict survived a pass built to overturn it. That pass
  _raised_ several continue-day estimates — guarding against underestimation — without flipping a
  single verdict.
- **The gap analysis was pessimistic, not optimistic.** It was found inaccurate on 9 surfaces, and
  every correction pointed toward _more_ existing value. The true continue position is stronger than
  even the matrix shows.

## Consequences

**Keep these; they are evidence-confirmed as value-correct and cost more to rebuild than to keep:**

- the unified `pages` tree
- the 8-type field engine (relations, rollups, coercion, zod as the single source)
- the streaming `useChat` composer + the tool-calling route
- the module registry + serialization facets
- the resolutions/transcript envelope, and the durable change-log store built on top of it
- the WAI-ARIA rail tree with drag-and-drop reparenting
- the `.dark` role-reassignment token architecture
- the OTP auth spine

**Two model tensions were identified as bounded migrations, not rebuild triggers. Both are now
shipped:** `type='area'` → area-as-page (#108, migration `0010`) and ephemeral transcript diffs →
the durable only-grows change-log (#102/#103, migrations `0011`–`0014`). They were the two
highest-leverage items in the evaluation, and they are banked.

**This decision is binding. Do not re-litigate it** (`AGENTS.md`). A surface-level replacement does
not need this ADR re-opened — it is already what the decision permits.
