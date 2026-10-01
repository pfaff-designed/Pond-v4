# ADR 0003 — Build M1 autonomously from the design handoff

- **Status:** Accepted
- **Date:** 2026-09-30
- **Deciders:** the user
- **Resolves:** `wayfinder/OPEN-QUESTIONS.md` §2 (type/spacing), §7 (autonomy), area hue, comments scope, task-store cadence
- **Related:** ADR 0001 (continue, do not rebuild), ADR 0002 (single-user first)

## Context

Three consecutive sessions ended by handing the user a list of questions instead of shipped code.
The questions were real but small — a 12px rounding, a rem-vs-px ruling, whether an area hue is
hashed or assigned — and each one had already been answered somewhere in
`wayfinder/design_handoff_pond/`, which is a complete, high-fidelity specification of the whole
product. The planning layer had become the work.

The user's instruction, verbatim: _"When you have my permission to merge things, you have my
permission to make decisions. You just do whatever it takes to get to the final product that
exists in the design document that I gave you."_

## Decision

**`wayfinder/design_handoff_pond/` is the source of truth and the plan.** M1 is built from it
without further planning rounds. `AGENTS.md`'s "grill before every build" rule is replaced: grill
only where the handoff and the ADRs are genuinely silent _and_ the choice would produce a
materially different product. Anything settled in `PROJECT_RULES.md`, `AUDIT.md`'s
"Decided, 26 sep" log, the inline values in the mockups, or `docs/adr/` is never re-asked.

### Autonomy granted

The agent owns the loop end to end: **worktree → builder agent → two-axis code review → live
browser-verify → merge.** No approval gate per issue. Decisions needed to finish a slice are made
and recorded in the PR body.

Two things stay gated, because they are not reversible by a revert:

1. **`supabase db push` against production** — it touches the user's real data, and which of
   migrations 0001–0015 are applied to prod is recorded nowhere. Build and verify against local
   or sandbox; batch prod pushes and ask once.
2. **Force-pushing or rewriting published history.**

### The five micro-decisions, derived from the handoff

| Question                                                  | Ruling                                                                                                                                       | Source                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Area hue — hashed or assigned?                            | **Assigned by the user; ink (no colour) is the default.** Not hashed.                                                                        | `PROJECT_RULES.md` § Colors: _"a user can colour-code an area… Ink is the default (no colour)."_ |
| 12px off-scale call sites (`text-xs` ×113, `text-sm` ×77) | UI scale is **11 / 13 / 16 / 18 / 22 / 28 / 36 / 46**. Mono machine-surface and small meta → **11**; everything else → **13**.               | README § Type; mono runs 10.5–12.5px                                                             |
| `spacing-mn-*` — rem or px?                               | **px.** Components step 4/8/12/16/24/32; layouts 48/80/120/160/240/320.                                                                      | README § Surfaces; the handoff writes px throughout                                              |
| Comments — M1 or M2?                                      | **Single-user half is M1**: a comment on your own page, and an `@pond` reply. `@mention` of a person routes to their proposed view → **M2**. | `AUDIT.md` 6p; selection bar C6                                                                  |
| Task-store cadence                                        | **File all of M1's issues up front**, so no build wave ever blocks on issue-filing.                                                          | operational                                                                                      |

## Consequences

- The user is no longer the bottleneck on anything the handoff already answers.
- Wrong calls are possible. They are cheap: every decision is recorded in a PR body, every change
  lands as a reviewed commit, and `main` can be reverted. That trade is the point of the grant.
- `wayfinder/OPEN-QUESTIONS.md` loses its reason to exist for M1. Entries leave it by becoming an
  issue or a ruling here.
