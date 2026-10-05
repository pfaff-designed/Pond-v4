# ADR 0008 — Blocks fill the content column; the board's per-kind `W` map is superseded

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** the user (product/design owner), with the agent
- **Related:** KAN-29; ADR 0003/0004 (THE DESIGN IS THE SOURCE OF TRUTH; board-conflict rulings); `PondBlock.dc.html`; `src/lib/modules/block-frame.ts` (`POND_BLOCK_WIDTHS`)

## Context

`PondBlock.dc.html` draws each block kind as a fixed-width card floating on the paper — `renderVals()`'s `W` map: list/checklist/number/properties **400**, log **460**, table **500**, gallery **580**. That map is transcribed verbatim into `POND_BLOCK_WIDTHS` and was applied to every block card, and the board-parity stories assert each rendered card equals it.

In use, the fixed widths read as cramped — a 500px table on a 672px (user-resizable 480–1200) content column leaves the block stranded mid-measure, and the same is true of every kind. The content **column** is already user-adjustable (`ContentWidthHandle`, #58), so the measure a person controls is the column; the block then sitting at a narrower fixed width is the thing that looks wrong.

This is a deliberate change to the design, not a code defect, so — per ADR 0003/0004 — it is ruled here rather than applied silently, and it overrides a value written in a board.

## The ruling

**Every block fills the content column by default.** The per-kind `W` map no longer governs layout: a block card is `w-full` and takes the width of the column it sits in (`ContentWidthHandle`'s measure), clamped by `max-w-full` so a narrow column never overflows.

### Carve-outs, so the override surface is exactly as wide as the decision

- **The deleted tombstone keeps 460 (`POND_BLOCK_TOMB_WIDTH`).** It is a transient state marking where a block _was_, not a block a person composes into; its board width stands until there is a reason to move it.
- **The compact chart card (`chart/card.tsx`, `w-[350px]`) is unchanged here.** It is `PondChart.dc.html`'s own compact mark, a different surface from the `PondBlock` frame; revisit under #227 if it should fill too.

### What this supersedes

- `POND_BLOCK_WIDTHS` is **retained as the board record** (the `.dc.html` values, so a future reader can see what the board drew and that this ADR overrode it) but is **no longer applied to layout**. Do not re-wire it into the card width "to match the board" — that is exactly the re-litigation ADR 0004 exists to prevent.
- The board-parity stories no longer assert a fixed px width per kind; they assert the card **fills its container**.
- **`PondBlock.dc.html` itself should be updated** to draw full-width blocks so the board and the code agree again. Until that lands, this ADR is the authority and the board's `W` map is known-stale for layout.

## Consequences

- `PondBlock` renders `w-full` for every non-deleted state; `WIDTH_CLASS` is removed.
- `block-frame.ts`'s `POND_BLOCK_WIDTHS` doc is annotated as the superseded board record.
- Width assertions across `PondBlock.stories.tsx`, `view-mapped-modes.stories.tsx`, `todo/view.stories.tsx`, `text/view.stories.tsx` and `entries/view.stories.tsx` change from "equals the kind's px" to "fills the container".
- **Per-block width override + a resize handle is a separate slice** (KAN-29's second half, split out): it needs a persisted per-block width, which is a block-data/serialization change, and does not belong in this layout-only slice.
