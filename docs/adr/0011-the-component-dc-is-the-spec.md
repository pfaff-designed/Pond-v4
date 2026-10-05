# ADR 0011 — The `Pond 02` component DC is the spec; storyboards only place it

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** the user (product/design owner), with the agent
- **Supersedes:** ADR 0010 (composed shell frame wins over the component DC)
- **Related:** `scripts/sync-handoff.sh`; `PondRail.dc.html`, `PondPicker.dc.html`, `PondComposer.dc.html`; boards 2c (`/` menu), 2g (command palette), 2r (rail), 2f (composer) in `Pond 02 Component library.dc.html`; KAN-56, KAN-57, KAN-58, KAN-61, KAN-62

## Context

ADR 0010 ruled that, for the five shell surfaces, the composed storyboards (`Pond 05 Shell`, `06.xx`) win over the component DCs, because the storyboards drew those surfaces differently.

That ruling was made against a stale mirror. `wayfinder/design_handoff_pond/` had been synced from the export's own `design_handoff_pond/` subfolder, which is an older bundle than the export's root. In the current export:

- every rail in `Pond 04`, `Pond 05`, `06.01`–`06.21` and `Pond 09` is `<dc-import name="PondRail">`, all placed identically, so the storyboards _render_ the component (only `Pond 07 Edges` keeps two pasted rails in a different layout). The "11px uppercase `life` + bell, no pond glyph" head that ADR 0010 adopted no longer exists anywhere;
- `PondRail` itself changed: the foot is `databases` + `settings` (no `＋ new page` row), and the selected row shows ＋ for a new page inside;
- the composer and pickers are not yet swapped: outside `Pond 02`, only `06.13`, `06.14` and `06.17` import `PondComposer` and only `06.13` imports `PondPicker`. `Pond 05 Shell` still pastes copies of both, which is where ADR 0010's palette and composer measurements came from.

The user's direction (2026-10-05): the components must reflect the components in `Pond 02 Component library`.

## The ruling

1. **The component DC is the spec for the component.** Its states, recipe, copy and every value styled inside it (sizes, padding, type, colour, radius, shadow) are final. This holds for every `Pond*` family, the five shell surfaces included.
2. **A storyboard says only where the component sits and which props it is given.** Placement comes from the `dc-import`'s own `style` (e.g. the rail: `left:20px; top:20px; bottom:20px; width:206px`, `height="fill"`) and the state/props it passes (`tree`, `selected`, `theme`).
3. **A pasted copy in a storyboard is not a spec.** Where a storyboard still pastes a component instead of importing it and the two disagree, the DC wins.
4. **The DC's `$preview` size is the harness, not the product.** A width or height the DC styles on its own root is the component's (the rail's 206 / 310 wide / 320 mobile); the `$preview` box it is shown in is not.
5. **The mirror is re-synced from the export root, never from its subfolder**, with `./scripts/sync-handoff.sh`. Before any parity slice, run it; a slice built from a stale mirror is not done.

## Consequences

- **Rail (KAN-56):** the head is the `PondRail` head (pond glyph 13px + name 13.5/500 + switcher chevron, bell on the right, padding `0 16px 12px`). The foot is `databases` (13.5/500) and `settings` (12.5px, ink 68%) over a 1px rule. `＋ new page` leaves the foot (this also closes KAN-25).
- **Command palette (KAN-57)** and **composer (KAN-61, KAN-62):** the ADR 0010 measurements (palette 560 / top 120 / blur wash; composer 508) came from pasted Shell copies. Re-spec both tickets from `PondPicker` / `PondComposer` before building, keeping only placement from imported storyboards.
- **`/` menu (KAN-58):** spec from `PondPicker kind="slash"` (board 2c).
- ADR 0010 is superseded in full. Its "recent frame breaks ties" rule survives only for placement, when two imported storyboards place a component differently.
