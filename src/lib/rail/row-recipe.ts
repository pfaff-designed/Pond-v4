/**
 * The row look both `Rail.tsx`'s `RailRow` (tree rows) and `RailFavouritesBand`
 * (flat favourite rows) build from — one home for each class string (KAN-475),
 * not two copies that drift. The two rows hit hover/selected through different
 * mechanisms (`RailRow` tracks `hovered` in JS state; the band is a plain `<a>`
 * with no JS hover state, so it uses Tailwind's `hover:`/`group-hover:`
 * variants) — these constants carry the bare values so each caller can apply
 * its own mechanism's syntax around them.
 */

/** `gap-[7px] py-[5px] pr-2` — the non-db-root tree row's own spacing, reused
 *  verbatim by the band (whose rows are never a db root). */
export const ROW_GAP_PY_PR = 'gap-[7px] py-[5px] pr-2'

/** `focus-visible:ring-2 focus-visible:ring-mn-text/50` — both rows' focus ring. */
export const ROW_FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-mn-text/50'

/** `bg-mn-hover-fill` — the selected-row fill, applied unconditionally by both. */
export const ROW_SELECTED_FILL = 'bg-mn-hover-fill'

/** `bg-mn-rail-hover` — the hovered-row fill. `RailRow` applies it directly off
 *  its own `hovered` state; the band applies it via the `hover:` variant. */
export const ROW_HOVER_FILL = 'bg-mn-rail-hover'

/** `hover:bg-mn-rail-hover` — the band's CSS-only hover fill, as the FULL
 *  literal Tailwind class. Tailwind only generates a `hover:` rule for a
 *  class it sees as a complete literal string in source — composing it at
 *  runtime (`` `hover:${ROW_HOVER_FILL}` ``) produces a string Tailwind never
 *  scanned, so no `.hover\:bg-mn-rail-hover` rule exists in the built
 *  stylesheet and the hover fill silently does nothing. */
export const ROW_HOVER_FILL_ON_HOVER = 'hover:bg-mn-rail-hover'

/** `text-[13px]` — the non-area-row label size (an area row stays at the
 *  board's 13.5px default, carried by `PondMolecule` itself). */
export const ROW_LABEL_SIZE_NOT_EMPHASISED = 'text-[13px]'

/** `text-mn-text-secondary` — the .68-ink label voice, dropped once a row is
 *  selected, hovered, or an area row (`isFullInk` / `isEmphasised`). */
export const ROW_LABEL_INK_NOT_FULL = 'text-mn-text-secondary'

/** `group-hover:text-mn-text` — the band's CSS-only hover-ink flip. `RailRow`
 *  reaches the same full-ink state through its own `hovered` JS state instead
 *  (folded into `isFullInk`), so it has no use for the CSS variant. */
export const ROW_LABEL_HOVER_INK_CSS = 'group-hover:text-mn-text'
