/**
 * The letterpress kicker (ticket-32): the small-caps, letterspaced label that
 * heads every authored object in the conversation surface — proposal-card headers,
 * the Sources row, the "Pond" attribution on a reply. One class constant (the
 * dialog-chrome pattern), so a fourth kicker never re-copies the recipe and the
 * tracking can be tuned in one place.
 *
 * It now holds the whole small-label family of that surface, all from the one
 * base, so no call site copies a recipe again:
 *
 * - {@link kickerClass} — the conversation surface's kicker.
 * - {@link eyebrowClass} — the Make Noise eyebrow the #97 boards write inline
 *   (sans · 500 · 10.5px · .1em · uppercase · ink .68): the "pond" attribution
 *   over an answer, the `new page — proposed` card's head, the made-from row.
 * - {@link chipBaseClass} — the quiet pill chip those boards hang labels in.
 */

const kickerBase = 'font-medium uppercase text-mn-text-secondary'

export const kickerClass = `${kickerBase} text-[0.65rem] tracking-[0.14em]`

export const eyebrowClass = `${kickerBase} font-sans text-[10.5px] tracking-[0.1em]`

/**
 * The machine surface's pill chip: the ink .07 fill, the pill, the 11px side
 * padding and the hover, which every board shares. Vertical padding and ink
 * differ board by board (6a's actions row is 6px at ink .8, the made-from row
 * 5px at full ink), so a caller appends those two — and nothing else.
 */
export const chipBaseClass =
  'rounded-mn-pill bg-mn-text/[0.07] px-[11px] transition-colors hover:bg-mn-text/[0.1]'
