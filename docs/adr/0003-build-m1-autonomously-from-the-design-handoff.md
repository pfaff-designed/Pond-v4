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

---

## Amendment, 2026-10-01 — the type ruling in the table above is SUPERSEDED

**What I ruled:** off-scale call sites snap to the README's UI scale of 11 / 13 / 16 / 18 / 22 / 28 / 36 / 46, with 12px going to 11 on the machine surface and 13 elsewhere.

**Why it was wrong:** the component boards do not use that scale. `PondAtom.dc.html` and `PondMolecule.dc.html` specify **13.5, 10.5, 12.5, 16.5, 17.5, 19, 30, 38, 56, 76**, and `PondAtom.tsx` (#93) and `PondMolecule.tsx` (#95) faithfully transcribe them. Applying my ruling would have had agents "correcting" accurate transcriptions into inaccurate ones — degrading fidelity while appearing to enforce a rule.

**Corrected:**

1. **A value written in a board wins, always.** `13.5px` means 13.5px. Never round to a scale step.
2. The README's scale is a **default for UI type where no board specifies a value** — a new surface, a state the boards do not draw. It is not a filter to run existing values through.
3. **Tailwind's named sizes stay banned** — this is what the original ruling was reaching for. `text-xs` (12), `text-sm` (14), `text-base`, `text-lg`, `text-xl` appear in no board. Replace with the board's exact value in bracket notation, or the scale default where no board covers the case.
4. The machine surface is **mono, 10.5–12.5px, tight letterspacing.** The token layer's `--tracking-wider: 0.1em` applied to mono inverts this; that is a defect, not a spec.

**The lesson, which matters more than the ruling:** I derived a rule from the README's prose and applied it over values measured from boards. `AGENTS.md`'s source order puts `PROJECT_RULES.md` above the mockups for **product law** — vocabulary, the diff model, colour roles — not for **values**. For a value the board is the most specific statement and it wins. This is the same disposition that let the row-delete `×` survive: treating what exists, or what reads as a general rule, as the baseline against which the design must argue. It is backwards.

## Third instance of the same failure, 2026-10-01 — name the pattern

The amendment above records one case: a type rule derived from the README's prose, applied over values measured from boards. It has now happened three times in one day, on the same axis:

1. **Type scale.** "Snap off-scale values to 11/13/16/18/22/28/36/46" — but the component boards specify 13.5, 10.5, 12.5, 16.5, and `PondAtom`/`PondMolecule` transcribe them faithfully. The rule would have corrupted accurate work.
2. **Mono letterspacing, attempt one.** "Mono carries no added letterspacing" — but board 6j's mono group labels are `.04em` and 6c's resolved status line is `.02em`.
3. **Mono letterspacing, attempt two.** "No tracking ≥ .05em on mono" — but `machineEyebrowClass` is mono at `.1em`, and on `Pond 06.01` both `new page — proposed` and the `pond` attribution resolve to a `PP Neue Montreal Mono` ancestor at `10.5 / 500 / .1em / uppercase / .68`.

The correct rule was only found by measuring: **the axis is uppercase eyebrow versus lowercase running mono.** The eyebrow carries `.1em` in _both_ mediums; what must stay tight is lowercase running mono.

**The pattern:** a plausible-sounding generalisation, written from prose, applied across many call sites at once, each time condemning values that were already correct. Every instance was caught by someone measuring a board — twice by a builder checking my rule rather than obeying it.

**The rule about rules:** before writing a constraint that will be applied in bulk, **measure at least three sites it will touch.** If any of them is already correct under the current code and wrong under the proposed rule, the rule is wrong. State constraints as the narrowest thing the measurements support, never as the tidy general principle they suggest.

And when a builder reports that a stated rule contradicts a board, **believe the board.** That has been right every time it has come up.
