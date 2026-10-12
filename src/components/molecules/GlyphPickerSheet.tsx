'use client'

/**
 * `PondPicker kind="glyph"` size="mobile" (KAN-250 4/4): the same glass as
 * `GlyphPicker`'s anchored desktop version, drawn as a bottom sheet instead —
 * the board's own 390px bottom-sheet radius and padding (`GLYPH_SIZES.mobile`,
 * `GLYPH_GLASS_SURFACE`), over `@base-ui/react/drawer` rather than
 * `useAnchoredBox`'s anchored positioning. `.motion-menu`'s scale-from-a-corner
 * origin is wrong for a sheet that slides from the bottom, so the slide is its
 * own transform, matching `dialogBackdropClass`'s own
 * `data-[starting-style]`/`data-[ending-style]` transition pattern rather than
 * borrowing `.motion-menu`.
 *
 * `Drawer.Root`'s `swipeDirection="down"` gives the drag-to-dismiss and its
 * `Backdrop` the tap-outside-to-dismiss — no hand-rolled gesture code.
 * `Drawer.Viewport` must wrap `Popup` for that swipe handling to actually
 * attach (Base UI warns and no-ops the gesture otherwise); it renders no
 * element of its own box model, so it doesn't interfere with `Popup`'s fixed
 * bottom-sheet position. `GlyphPickerBody`'s own document-capture keydown
 * listener calls `stopPropagation` on Escape (`GlyphPicker.tsx:385-392`), so
 * Base UI's own Escape handling never sees the key — that capture listener
 * is the one close path for it, converging on the same `onClose` as every
 * other close path.
 *
 * The drawer barrel's `Handle` (`DrawerHandle`, from `handle.js`) is an
 * imperative class for associating a DETACHED `Drawer.Trigger` with this
 * root — it is not a renderable grip bar, so nothing is mounted here under
 * that name: this sheet is fully controlled by `open`, has no trigger of its
 * own, and no board frame draws a grip.
 *
 * `Drawer.Viewport`'s own `onPointerDown` starts a swipe (and
 * `setPointerCapture`s the pointer) on any press whose target doesn't match
 * `button,a,input,select,textarea,label,[role="button"]` and has no
 * scrollable ancestor — `GlyphPickerBody`'s cells are `role="gridcell"`/
 * `role="option"` divs, so a press on a list too short to scroll is
 * retargeted to the drawer and the cell's own `onClick` never fires.
 * `BODY_WRAPPER` stops that pointerdown from reaching the viewport for a
 * pick target only, before Base UI's own handler sees it; drag-down from the
 * head, gaps and padding is untouched.
 */

import { Drawer } from '@base-ui/react/drawer'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { GLYPH_GLASS_SURFACE, GLYPH_SIZES, GlyphPickerBody, type GlyphPickerProps } from './GlyphPicker'

export type GlyphPickerSheetProps = Omit<GlyphPickerProps, 'anchor' | 'side' | 'container'> & {
  open: boolean
}

/**
 * Pond 06.24 's24.6 phone' draws the rail at full strength behind the sheet
 * (`PondPicker` over an undimmed `PondRail`) — this is the tap-outside target
 * only, not a scrim.
 */
const SHEET_BACKDROP = 'fixed inset-0 z-[100]'

// No exit classes: Rail always passes `open` and unmounts this component on
// close rather than flipping it to `false`, so `data-[ending-style]` never fires.
// `w-full max-w-[390px]`, not `GLYPH_SIZES.mobile.width`'s fixed `w-[390px]`:
// the board's 390px is the viewport the frame was drawn at, not a floor —
// below it (360/375px phones) a fixed 390px overflows the screen sideways
// (AUDIT X1).
//
// The side padding can't stay the board's fixed 23px below 390px either: a
// full row is 7 cells of 44px plus 6 gaps of 6px = 344px, which needs the
// popup's content box to be at least 344px wide. At 390px, 23px either side
// leaves exactly that; below it, 23px would clip the row, so the sides give
// way down to an 8px floor — `clamp(8px, (100vw-344px)/2, 23px)` is 23px at
// a 390px viewport and 8px (the minimum that still fits the row) at 360px.
// Top (10px) and bottom (34px) stay `GLYPH_SIZES.mobile.glassPadding`'s own
// fixed values — only the sides are viewport-dependent.
const SHEET_POPUP =
  `fixed inset-x-0 bottom-0 z-[100] mx-auto w-full max-w-[390px] ` +
  `pt-[10px] pb-[34px] px-[clamp(8px,calc((100vw-344px)/2),23px)] ` +
  `${GLYPH_SIZES.mobile.glassRadius} ${GLYPH_GLASS_SURFACE} ` +
  'transition-transform data-[starting-style]:translate-y-full'

const PICK_TARGET_SELECTOR = '[role="gridcell"],[role="option"]'

const handleBodyPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
  if ((event.target as Element).closest(PICK_TARGET_SELECTOR)) {
    event.stopPropagation()
  }
}

export function GlyphPickerSheet({
  open,
  target,
  current,
  accent,
  recentGlyphs,
  inheritsFrom,
  role = null,
  onPickColour,
  onPick,
  onClose,
}: GlyphPickerSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop data-part="backdrop" className={SHEET_BACKDROP} />
        <Drawer.Viewport>
          <Drawer.Popup data-part="glass" data-kind="glyph" finalFocus={false} className={SHEET_POPUP}>
            <div className="contents" onPointerDown={handleBodyPointerDown}>
              <GlyphPickerBody
                target={target}
                current={current}
                accent={accent}
                recentGlyphs={recentGlyphs}
                inheritsFrom={inheritsFrom}
                role={role}
                onPickColour={onPickColour}
                size="mobile"
                onPick={onPick}
                onClose={onClose}
              />
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
