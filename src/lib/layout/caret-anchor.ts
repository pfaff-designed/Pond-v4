/**
 * Where a picker hangs when it opens at the caret (`Pond 02` 2c: "opens at the
 * caret, on the page"), and which way it grows from there.
 *
 * A `<textarea>` exposes no caret geometry, so the caret is read off a hidden
 * mirror of the field set in the same type, wrapped at the same width, with a
 * marker span where the selection sits.
 */

import type { PickerAnchorBox, PickerSide } from '@/components/molecules/use-anchored-box'

type CaretRect = ReturnType<PickerAnchorBox['getBoundingClientRect']> &
  Pick<DOMRect, 'right' | 'width' | 'height'>

/** The properties that decide where a character wraps and how tall its line is. */
const MIRRORED = [
  'direction',
  'boxSizing',
  'width',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const

const rectOf = (left: number, top: number, height: number): CaretRect => ({
  left,
  top,
  height,
  width: 0,
  right: left,
  bottom: top + height,
})

function textareaCaret(field: HTMLTextAreaElement): CaretRect {
  const computed = getComputedStyle(field)
  const mirror = document.createElement('div')
  for (const prop of MIRRORED) mirror.style[prop] = computed[prop]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.textContent = field.value.slice(0, field.selectionStart)
  const marker = document.createElement('span')
  // A caret at the very end still needs a glyph to sit on.
  marker.textContent = field.value.slice(field.selectionStart) || '.'
  mirror.append(marker)
  document.body.append(mirror)
  const at = { left: marker.offsetLeft, top: marker.offsetTop, height: marker.offsetHeight }
  mirror.remove()

  const box = field.getBoundingClientRect()
  return rectOf(
    box.left + field.clientLeft + at.left - field.scrollLeft,
    box.top + field.clientTop + at.top - field.scrollTop,
    at.height
  )
}

/**
 * The caret's rect inside `root`, in viewport coordinates. A focused textarea is
 * read off its mirror, any other selection off its range, and with neither the
 * root's own box stands in.
 */
export function caretRect(root: Element): CaretRect {
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement && root.contains(active)) return textareaCaret(active)

  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  if (range && root.contains(range.startContainer)) {
    const box = range.getBoundingClientRect()
    if (box.height > 0) return rectOf(box.left, box.top, box.height)
  }

  const box = root.getBoundingClientRect()
  return rectOf(box.left, box.top, box.height)
}

/** The glass's gap to its anchor — `useAnchoredBox`'s 4. */
const GAP = 4

/**
 * Which way the glass grows: below the caret when it fits, otherwise toward the
 * side with more room. `needed` is the glass's tallest height.
 */
export function sideTowardFreeSpace(
  caret: Pick<DOMRect, 'top' | 'bottom'>,
  viewportHeight: number,
  needed: number
): PickerSide {
  const below = viewportHeight - caret.bottom - GAP
  const above = caret.top - GAP
  return below >= needed || below >= above ? 'bottom' : 'top'
}
