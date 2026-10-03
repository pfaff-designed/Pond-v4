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
 * 2. **A font size does NOT clobber `leading-*` here.** Stock Tailwind's `text-lg`
 *    carries its own line-height, so tailwind-merge treats the two as conflicting.
 *    This repo's sizes never do — every `--text-mn-*` compiles to `font-size` alone
 *    (and bracket sizes likewise), with leading carried by separate `--leading-*`
 *    tokens. Left stock, fixing (1) would have STARTED dropping `leading-tight` from
 *    `leading-tight text-mn-22`, which works today only because of the bug in (1).
 *    Trading one silent drop for another is not a fix.
 *
 * Measured and deliberately NOT configured: `bg-mn-*` and `border-mn-*` already
 * dedupe correctly (they are genuine colour groups). `rounded-mn-*`, `p-mn-*` and
 * `gap-mn-*` do the opposite — tailwind-merge does not know those custom scales, so
 * it keeps BOTH classes and the stylesheet's own order decides. That is a real
 * hazard but a different one from #252's silent drop, so it is reported rather than
 * patched in speculatively.
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
