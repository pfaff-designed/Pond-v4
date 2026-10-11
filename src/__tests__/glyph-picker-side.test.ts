import { glyphPickerHeight } from '@/components/molecules/GlyphPicker'
import { sideTowardFreeSpace } from '@/lib/layout/caret-anchor'

/**
 * The glass's own `side` — `Rail.tsx`'s `toggleMarkPicker` picks it at open time
 * from `glyphPickerHeight` + `sideTowardFreeSpace` (`use-slash-line.ts`'s own
 * shape), so a mark low in the rail opens its picker upward instead of running
 * the foot off the bottom of the viewport.
 *
 * The on-screen invariant itself (the glass's measured box staying inside the
 * viewport once the list is capped to the chosen side's real room) is NOT
 * tested here: jsdom has no layout engine, so a jest assertion could only
 * replay the component's own estimate back at itself — that is exactly how a
 * prior version of this file's `renderedHeight` helper passed green while the
 * live glass ran 10.5px off the viewport edge. That invariant now lives in
 * `GlyphPicker.stories.tsx`'s `OnScreenBelowAnchor` / `OnScreenBelowAnchorArea`
 * / `OnScreenAboveAnchor`, measured in `test-storybook`'s real Chromium. This
 * file keeps only the side CHOICE, which `sideTowardFreeSpace` computes from
 * plain numbers and needs no real layout to verify.
 */
describe('glyphPickerHeight + sideTowardFreeSpace', () => {
  const viewportHeight = 900
  const target = { isArea: false, title: 'workouts' }
  const height = glyphPickerHeight(target, 'desktop', [], viewportHeight)

  it('predicts a glass tall enough to need the 60vh list cap (matches a live 1440x900 measurement)', () => {
    // The capped library (23 rows of 182 glyphs) plus head/foot/inherit rows —
    // close to the 676.5px measured live, proving the estimate is a real bound,
    // not a guess that happens to pass.
    expect(height).toBeGreaterThan(600)
    expect(height).toBeLessThan(700)
  })

  it('flips to top for a mark low in the rail, where below cannot fit it but above can', () => {
    const anchor = { top: 700, bottom: 730 }
    const side = sideTowardFreeSpace(anchor, viewportHeight, height)
    expect(side).toBe('top')

    // `useAnchoredBox`'s own math for `side: 'top'`: the glass's bottom edge
    // sits 4px above the anchor's top, growing upward by `height`.
    const glassBottom = anchor.top - 4
    const glassTop = glassBottom - height
    expect(glassBottom).toBeLessThanOrEqual(viewportHeight)
    expect(glassTop).toBeGreaterThanOrEqual(0)
  })

  it('stays bottom for a mark near the top, where below already fits', () => {
    const anchor = { top: 100, bottom: 130 }
    const side = sideTowardFreeSpace(anchor, viewportHeight, height)
    expect(side).toBe('bottom')

    // `useAnchoredBox`'s own math for `side: 'bottom'`: the glass's top edge
    // sits 4px below the anchor's bottom.
    const glassTop = anchor.bottom + 4
    const glassBottom = glassTop + height
    expect(glassBottom).toBeLessThanOrEqual(viewportHeight)
  })

  /**
   * `glyphPickerHeight`'s own 666px estimate is a CEILING — the height the
   * glass would need with unlimited room. Below, `below >= needed` never
   * holds (614 < 666), so `sideTowardFreeSpace` falls through to its
   * `below >= above` tiebreaker and picks `bottom` even though bottom does
   * not actually have 666px — exactly the anchor the live walk measured.
   * Whether the glass then actually fits in that smaller room is the
   * on-screen invariant, which this file does not assert (see the describe
   * block's own doc comment) — `GlyphPicker.stories.tsx`'s
   * `OnScreenBelowAnchor` uses this exact anchor.
   */
  it('falls through to bottom at the anchor the live walk measured (anchor.bottom 282), even though bottom lacks the ceiling', () => {
    const anchor = { top: 254, bottom: 282 }
    const side = sideTowardFreeSpace(anchor, viewportHeight, height)
    expect(side).toBe('bottom')
    expect(viewportHeight - anchor.bottom - 4).toBeLessThan(height)
  })

  it('falls through to bottom at a low anchor that falls short of the ceiling (y 358)', () => {
    const anchor = { top: 358, bottom: 386 }
    const side = sideTowardFreeSpace(anchor, viewportHeight, height)
    expect(side).toBe('bottom')
    expect(viewportHeight - anchor.bottom - 4).toBeLessThan(height)
  })
})
