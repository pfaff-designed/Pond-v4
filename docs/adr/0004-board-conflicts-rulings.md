# ADR 0004 — Rulings on board-vs-board conflicts and two places the handoff contradicts its own law

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** the agent, under the autonomy granted in ADR 0003
- **Related:** ADR 0003 (and its 2026-10-01 type amendment), `AGENTS.md` § THE DESIGN IS THE SOURCE OF TRUTH

## Context

A full conformance audit of the nine child DCs against the code found the component layer **bimodal and chronological**: everything built since the handoff landed conforms closely, everything built before it diverges structurally. Rebuilding the divergent half is the plan.

The audit also found **six conflicts that no amount of measurement resolves**, because the handoff disagrees with itself or with its own stated law. Every rebuild would hit all six and land somewhere different. They are ruled here, once.

## The rulings

### 1. Composer answer prose — **13.5px / 1.55**

`PondComposer.dc.html` says `15 / 1.6`; `Pond 06.01` renders `13.5 / 1.55`; the handoff README says _"Composer answers are 13.5px / 1.55."_ Two independent sources against one. **13.5 / 1.55.**

### 2. The `pond` eyebrow over an answer — **mono**

`PondComposer.dc.html` sets it in sans. But measuring `Pond 06.01` directly gives **PP Neue Montreal Mono**, and `PROJECT_RULES.md` § Design language puts the composer squarely in the machine surface, which is mono. Measurement plus law against one board. **Mono** — `machineEyebrowClass`, as `atoms/kicker.ts` already has it.

### 3. Composer width — **534px**

`PondComposer.dc.html` says 560; the `Pond 05 Shell` frame says 534. Same shape as the rail-header decision already recorded in ADR 0002/0003: **the composed context outranks the isolated component card**, because the Shell is unanimous across its frames and is what a person actually sees. **534.**

### 4. ⌘K palette rows — **sans rows, mono chrome** (follow the board)

`PROJECT_RULES.md` names the command palette as a machine surface, which reads as "all mono". The board is finer-grained: palette **chrome** (group labels, hint keys, the foot legend, the scope chip) is mono; palette **rows** — which are page names — are **sans 13.5 at full ink**.

The board is the more specific statement and it is also the more coherent rule: the medium split is about _what the text is_, not which surface it appears on. A page's name is page content quoted inside a machine surface. It stays sans.

### 5. The big figure on a data page — **52px / 700, as drawn**

`PondTemplate.dc.html`'s `number` block is 52px at weight 700 (44 mobile), which is off the README's UI scale and off the sans weights the rules name. Per ADR 0003's 2026-10-01 amendment, **a value written in a board is final** and the README's scale is a default for cases no board covers. Build it at 52/700. It is the biggest figure in the handoff and `PROJECT_RULES.md` explicitly wants data pages to lead with one oversized figure.

### 6. `PondRail`'s sage row hover — **rejected; keep ink 5%**

`PondRail.dc.html` paints the row hover `rgba(100,143,123,.07)` light / `.14` dark — **sage as a row background**. `PROJECT_RULES.md` is unambiguous: area colours apply **to marks only** — the area glyph and page kind dots — "never text, grounds, cards or buttons."

This is the one case where a board loses, because the conflict is with **product law**, not with another value. `AGENTS.md`'s source order puts `PROJECT_RULES.md` above the mockups for roles and colour jobs. The code's existing `bg-mn-text/5` is the compliant reading. **Do not patch the rail toward the board here.**

## The principle these share

A board wins on **values**. `PROJECT_RULES.md` wins on **roles and law** — what a colour's job is, which register a medium takes, what the product calls a thing. When two boards disagree on a value, prefer the one corroborated by a second source, and prefer the composed context over the isolated component card.

This is the inverse of the mistake in ADR 0003's original type ruling, where prose was applied over measured values. Prose governs roles; boards govern values.

## Consequences

- The rebuilds of PondPicker, the chart card and PondTemplate, and the patches to PondRail and PondComposer, all start from settled ground.
- One board instruction is deliberately not implemented (#6) and that is recorded here so it is not "fixed" later by someone measuring the board and finding the code wrong.
