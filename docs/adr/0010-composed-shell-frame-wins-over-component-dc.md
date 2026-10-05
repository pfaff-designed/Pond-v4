# ADR 0010 — The composed shell frame wins over the component DC (for the five shell surfaces)

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user (product/design owner), with the agent
- **Related:** ADR 0003 (THE DESIGN IS THE SOURCE OF TRUTH), ADR 0004 (board-conflict rulings — don't re-litigate); `PROJECT_RULES.md` authoritative-source order; the five shell-surface audits (2026-10-04: rail, composer, command palette, canvas, slash menu); `PondRail.dc.html` / `PondPicker.dc.html` / `PondComposer.dc.html`; `Pond 05 Shell.dc.html`; `Pond 06.21 Tasks.dc.html`

## Context

Auditing the five surfaces a person actually touches — **the rail, the composer, the command palette, the canvas, and the slash menu** — surfaced repeated conflicts between two `.dc.html` sources that are both "the mockups" under `PROJECT_RULES.md`:

- the **`Pond 02` component DCs** (`PondRail`, `PondPicker`, `PondComposer`), and
- the **composed storyboards** (`Pond 05 Shell`, the `Pond 06.xx` frames, newest being `06.21 Tasks`).

`PROJECT_RULES.md` ranks "a decision beats a mockup frame," but is silent on **mockup-vs-mockup** when a component DC and a storyboard draw the same surface differently. Examples found:

- **Rail head:** `PondRail` draws a 13.5px pond-glyph + name head; `Shell` / `06.21 Tasks` draw an 11px uppercase "life" head with a down chevron and a bell, no pond glyph.
- **Command palette:** `PondPicker` = 520px, top 110, trailing `esc`, with a foot legend; `Shell` 5u = 560px, top 120, `left: calc(50% + 13px)` translateX(−50%), wash `rgba(250,249,239,.55)` + `blur(2px)`, `⌘K` on the launcher, no foot.
- **Composer width:** `PondComposer` 560 vs `Shell`/`06.21` **508** (code was 534).

## The ruling

**For the five shell surfaces, the composed storyboard wins over the component DC.**

The component DCs are a **parts catalog** — they define each component's _states and internal recipe_ in isolation, and their standalone preview dimensions are **harness artifacts, not shipping sizes**. The storyboards are **the product in use** — they define how a surface actually appears to a person: placement, dimensions, launcher composition, and which head/foot/state is real. A surface is judged by how it appears to a person, which is exactly what a storyboard depicts.

1. **The composed storyboard is authoritative for everything it actually draws** — placement, size, launcher, head/foot content, and which states appear. **Ties break toward the most recent frame** (so `06.21 Tasks`, board 21 of 21, beats older frames). This follows the standing "new decisions win" rule.
2. **The component DC is authoritative only for states / sub-recipes the storyboard does not show** — the palette's `typing` / `record` / `scoped` states, the composer's full state machine, the rail's `rename` / `pinned` / `shared`. These fill the gaps the storyboard leaves.
3. **On a conflicting _visible element_, the storyboard wins and the DC fills the rest.** Two differently-named elements are not a conflict (e.g. the palette launcher's `⌘K` and the open palette's internal `esc` dismiss hint coexist).

### Canonical source of the boards

The **Claude design project** (`claude.ai/design/p/8174687a-…`, e.g. `Pond 06.21 Tasks.dc.html`) is the **canonical** source of the component designs. The repo's `wayfinder/design_handoff_pond/` is a **local mirror** of it and is what audits/builds read. If the two ever diverge, **re-sync the mirror from the design project**; the project wins.

## Applied to the three conflicts

- **Rail head →** Shell / `06.21`: **11px uppercase "life" + down chevron + bell, no pond glyph**, head padding `0 16px 18px`. (`PondRail`'s 13.5px pond-glyph head is superseded for the shell; its `rename` / `pinned` / `shared` states still stand.)
- **Command palette →** `Shell 5u`: **560px, top 120, `left: calc(50% + 13px)` translateX(−50%), wash `rgba(250,249,239,.55)` + `blur(2px)`, `⌘K` on the launcher chip.** The open-palette foot legend and `typing` / `record` / `scoped` states come from `PondPicker`; the internal `esc` dismiss hint is a different element from the launcher `⌘K`, so both stay.
- **Composer width →** **508px** (Shell + `06.21` agree). 534 (code) and 560 (`PondComposer`) are both superseded.

## Consequences

- The Rail, Command Palette and Composer parity slices take their measurements from the storyboards per the above; cite this ADR rather than re-opening the conflict.
- Where a future surface conflict arises, resolve it by this rule (storyboard wins for what it draws; DC fills gaps; recent frame breaks ties) instead of raising a new question.
- This governs the **five shell surfaces**. It does **not** change the `Pond 02` component library's own parity (`PondAtom`/`Control`/`Molecule`/`Block`/`Chart`), where the component DC remains the primary spec.
- `Pond 09 Examples` remains illustration, not spec (unchanged).
