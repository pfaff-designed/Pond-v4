/**
 * The mist focus ring — ONE owner (#221).
 *
 * `PondControl.dc.html` focuses every control with `outline: 2px solid #A5C8D1;
 * outline-offset: 2` — mist. `PROJECT_RULES.md` keeps area colours to marks, and
 * ADR 0004 ruling 6 rejected sage as a row *ground* on that law — but a focus
 * OUTLINE is not a ground, and both shipped families (`PondAtom` #93,
 * `PondMolecule` #95) already wear this ring. `--mn-area-b` is `--raw-mist` on
 * both themes, so the ring never flips. Ink is already spent: `0 0 0 2px ink` is
 * the `selected` recipe (#238), so an ink focus ring would read as selection.
 *
 * Three spellings of the same fact, because Tailwind's scanner needs each full
 * class literal in source and cannot see a `focus-visible:${x}` template:
 *
 * - {@link FOCUS_RING} — forced, for a `state="focus"` matrix cell.
 * - {@link FOCUS_VISIBLE_RING} — live, on the focusable element itself.
 * - {@link FOCUS_WITHIN_RING} — live, on a box whose input carries the focus
 *   (the field's card, per the board: the ring sits on `field`, not the text).
 *
 * Never redeclare `FOCUS_RING` in a component; import it from here.
 */
export const FOCUS_RING = 'outline-2 outline-offset-2 outline-mn-area-b'

export const FOCUS_VISIBLE_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mn-area-b'

export const FOCUS_WITHIN_RING =
  'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mn-area-b'
