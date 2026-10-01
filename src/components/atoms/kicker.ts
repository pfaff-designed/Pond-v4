/**
 * The letterpress kicker (ticket-32): the small-caps, letterspaced label that
 * heads every authored object in the conversation surface — proposal-card headers,
 * the Sources row, the "Pond" attribution on a reply. One class constant (the
 * dialog-chrome pattern), so a fourth kicker never re-copies the recipe and the
 * tracking can be tuned in one place.
 *
 * It holds the whole small-label family of that surface, all from one base, so no
 * call site copies a recipe again:
 *
 * - {@link kickerClass} — the conversation surface's kicker.
 * - {@link machineEyebrowClass} / {@link pageEyebrowClass} — the Make Noise eyebrow.
 * - {@link chipBaseClass} — the quiet pill chip those boards hang labels in.
 *
 * ## The eyebrow comes in two mediums, and they must not be merged
 *
 * Measured off `Pond 06.01` board 6a, all four eyebrows share **10.5px / 500 /
 * .1em / uppercase / ink .68** and differ in exactly one thing — the family:
 *
 * | label                 | lives on            | family                |
 * | --------------------- | ------------------- | --------------------- |
 * | `pond` (attribution)  | the composer        | PP Neue Montreal Mono |
 * | `new page — proposed` | the composer        | PP Neue Montreal Mono |
 * | `made from`           | the page            | PP Neue Montreal      |
 * | `mentioned`           | the page            | PP Neue Montreal      |
 *
 * That is PROJECT_RULES § Design language, **two registers split by medium, not by
 * author**: the machine surface (composer, palette, @-picker, diff cards,
 * provenance chips) is the mono; anything that lives on a page is the sans. So the
 * two are named for the MEDIUM, not for the component that happens to use them —
 * pick by where the label lives, and never collapse them back into one constant.
 */

const eyebrowBase = 'font-medium text-[10.5px] uppercase tracking-[0.1em] text-mn-text-secondary'

export const kickerClass =
  'text-[0.65rem] font-medium uppercase tracking-[0.14em] text-mn-text-secondary'

/** The eyebrow on the MACHINE surface — the composer and its cards. Mono. */
export const machineEyebrowClass = `${eyebrowBase} font-mono`

/** The eyebrow on a PAGE — made-from, the mentioned list. Sans. */
export const pageEyebrowClass = `${eyebrowBase} font-sans`

/**
 * The machine surface's pill chip: the ink .07 fill, the pill, the 11px side
 * padding and the hover, which every board shares. Vertical padding and ink
 * differ board by board (6a's actions row is 6px at ink .8, the made-from row
 * 5px at full ink), so a caller appends those two — and nothing else.
 */
export const chipBaseClass =
  'rounded-mn-pill bg-mn-text/[0.07] px-[11px] transition-colors hover:bg-mn-text/[0.1]'
