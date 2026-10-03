import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The Make Noise type scale, as tailwind-merge needs to see it (#87's eight UI
 * steps, mirroring `--text-mn-*` in `globals.css`).
 *
 * `cn-merge.test.ts` asserts this list equals the tokens in `globals.css`, so a
 * ninth step added to the token layer fails a test instead of silently
 * reopening #252.
 */
export const MN_TEXT_SCALE = [
  'mn-11',
  'mn-13',
  'mn-16',
  'mn-18',
  'mn-22',
  'mn-28',
  'mn-36',
  'mn-46',
] as const

/**
 * tailwind-merge, taught this design system's two departures from stock Tailwind
 * (#252). Both were measured against `twMerge` directly, not inferred.
 *
 * 1. **`text-mn-*` is a FONT SIZE, not a text colour.** Stock tailwind-merge sees
 *    `text-mn-16` and `text-mn-text-secondary` as the same `text-*` group and drops
 *    one — silently, and which one depends only on argument order. That shipped the
 *    `notice` title (so `PondBlock`'s error state) at the wrong ink tier, and it is
 *    why a `record-card` title lost its 13px in `empty`.
 *
 * 2. **A font size does NOT clobber `leading-*` here.** tailwind-merge drops a
 *    preceding `leading-*` when a size follows it, because stock Tailwind's
 *    `text-lg` carries its own line-height. Left stock, fixing (1) would have
 *    STARTED dropping `leading-tight` from `leading-tight text-mn-22`, which works
 *    today only because of the bug in (1) — trading one silent drop for another is
 *    not a fix.
 *
 *    Safe because an explicit leading wins at any order: `--text-mn-*` and bracket
 *    sizes compile to `font-size` alone, and even for a size that DOES carry one,
 *    Tailwind v4 resolves it through `@property --tw-leading`, so a `leading-*`
 *    utility beats the size's paired value. NOT because named sizes are banned —
 *    that ban covers only `shell-reskin`'s 12-file whitelist, and stock sizes are
 *    live in ~166 places. `cn-merge.test.ts` pins the `text-lg` case for that
 *    reason.
 *
 * Measured and deliberately NOT configured: `bg-mn-*`, `border-mn-*`, `ring-mn-*`
 * and `shadow-mn-*` already behave correctly — same-family pairs dedupe, and
 * `ring-mn-area-b` + `ring-2` rightly keeps both (a colour and a width). `rounded-mn-*`, `p-mn-*`
 * and `gap-mn-*` do the opposite — tailwind-merge does not know those custom scales,
 * so it keeps BOTH classes and the stylesheet's own order decides. A real hazard,
 * but a different one from this issue's silent drop, so it is deferred rather than
 * patched in speculatively. **ADR 0004 ruling 13 is the decision of record, with the
 * measurements — not this comment.**
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...MN_TEXT_SCALE] }],
    },
  },
  override: {
    conflictingClassGroups: {
      'font-size': [],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
