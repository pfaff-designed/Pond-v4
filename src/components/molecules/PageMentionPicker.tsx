'use client'

/**
 * The composer's `@` picker (`PondComposer.dc.html`'s `popover`, KAN-99):
 * headed `pages`, each row a page's mark, title and area. The host owns
 * `activeIndex` and the `@`-query narrowing; this component owns only the
 * keys that work it and where it sits.
 *
 * Every literal is `PondComposer.dc.html`'s `specVals()` (`sPop`, `sPopHead`,
 * `r.st`, `sPopSub`): the sans register, not the mono `PondPicker` chrome
 * (`picker-chrome.ts`) — this popover is the composer's own (ADR 0004 §4
 * keeps the two apart). `sPopHead`'s colour is `a(.68)`, which the app's own
 * tokens map to `text-mn-text-secondary` (ink .68), not `text-mn-text-meta`
 * (ink .8) — see `slash-row.tsx`'s `SUB`/`GROUP` in `picker-chrome.ts` for the
 * same mapping. `sKey`'s `↵` is byte-identical to `slash-row.tsx`'s `ENTER`,
 * reused rather than restated. `sPop` has no `display`/`gap` of its own, so
 * the head and the rows simply stack — no `flex-col` wrapper here either.
 *
 * The glass listens on the document in the capture phase so ↑↓↵esc reach it
 * before the composer's own textarea, which never loses focus (`SourcePicker
 * .tsx`'s own pattern). It portals to `document.body` at a fixed box off the
 * anchor's rect. The anchor is the composer's own glass (the card that holds
 * `ReferencesRow`, the line and the toolbar) — not the line alone — so that
 * sitting above it (the usual case: the composer sits at the foot of the
 * screen) clears the references row's current-page chip rather than
 * covering it. The DC's `sPop` sits `bottom: calc(100% + 10px)` off that
 * glass, inset `left: 12, right: 12` — a 10px gap (`POPOVER_GAP_PX`, not
 * `useAnchoredBox`'s 4px default) and a 12px inset (`POPOVER_INSET_PX`) off
 * each side of the anchor's own width, not a fixed picker width like
 * `SourcePicker`'s 300/340 — so the glass's width is read straight off the
 * anchor's own rect (minus the inset) rather than `useAnchoredBox`'s
 * width-clamp param: that param clamps `left` against a glass width
 * independent of its anchor, which this glass never has (its width IS its
 * anchor's, inset by 12 on each side).
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AreaMark } from '@/components/atoms/AreaMark'
import { ENTER } from './slash-row'
import { useAnchoredBox, type PickerSide } from './use-anchored-box'

export interface PageMentionItem {
  id: string
  /** The page's mark glyph, from `areaGlyph`/`LIFE_GLYPH`. */
  glyph: string
  /** The page's area hue. Ink until an area sets one. */
  color?: string
  label: string
  /** The page's area, shown inline after the label. */
  sub: string
}

/** The composer: its own rect gives the glass both its position and its width. */
export interface MentionAnchorBox {
  getBoundingClientRect(): Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>
}
export type MentionAnchor = MentionAnchorBox | null | RefObject<MentionAnchorBox | null>

export interface PageMentionPickerProps {
  items: readonly PageMentionItem[]
  activeIndex: number
  onHover: (index: number) => void
  onPick: (item: PageMentionItem) => void
  /** Esc — the host keeps the typed text. */
  onClose: () => void
  /** The composer the glass hangs off. */
  anchor: MentionAnchor
  /** @default 'bottom' */
  side?: PickerSide
}

const HEAD =
  'px-[10px] pt-[4px] pb-[8px] font-sans text-[10.5px] font-medium tracking-[.1em] uppercase text-mn-text-secondary'

const ROW =
  'flex cursor-default items-center gap-[10px] rounded-[14px] px-[10px] py-[8px] font-sans text-[13px] text-mn-text'

const SUB = 'min-w-0 truncate text-[12.5px] text-mn-text-secondary'

/** `PondComposer.dc.html`'s `sPop`: `bottom: calc(100% + 10px)` off the anchor. */
const POPOVER_GAP_PX = 10
/** `PondComposer.dc.html`'s `sPop`: `left: 12, right: 12` off the anchor. */
const POPOVER_INSET_PX = 12

/** The anchor's live value, ref or raw — the one place both effects below (and the width effect) read it from. */
function resolveAnchorBox(anchor: MentionAnchor): MentionAnchorBox | null {
  return anchor && 'current' in anchor ? anchor.current : anchor
}

/** The anchor as a real element, when it is one — the test fixtures' plain `{getBoundingClientRect}` objects aren't. */
function resolveAnchorElement(anchor: MentionAnchor): HTMLElement | null {
  const el = resolveAnchorBox(anchor)
  return el && typeof (el as Partial<HTMLElement>).contains === 'function' ? (el as unknown as HTMLElement) : null
}

export function PageMentionPicker({
  items,
  activeIndex,
  onHover,
  onPick,
  onClose,
  anchor,
  side = 'bottom',
}: PageMentionPickerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      let handled = true
      if (e.key === 'ArrowDown') onHover(Math.min(activeIndex + 1, items.length - 1))
      else if (e.key === 'ArrowUp') onHover(Math.max(activeIndex - 1, 0))
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter') {
        // An IME commit also fires `Enter`; that keystroke is the composition's,
        // not a pick. A query with zero matching rows has no active item to pick
        // either way, and swallowing the key then would silently eat the
        // composer's own send — fall through unhandled in both cases.
        if (e.isComposing) return
        const item = items[activeIndex]
        if (item) onPick(item)
        else handled = false
      } else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  // A press, or a focus change, that lands outside both the glass and the
  // composer it hangs off closes it — `SourcePicker.tsx`'s own pointerdown
  // pattern, plus a blur check this picker also needs: the composer's
  // textarea never loses focus while a row is picked (rows preventDefault
  // their own mousedown), so a real blur means focus left for the page.
  const glassRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (glassRef.current?.contains(target)) return
      if (resolveAnchorElement(anchor)?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [anchor, onClose])

  useEffect(() => {
    const anchorEl = resolveAnchorElement(anchor)
    if (!anchorEl) return
    function onFocusOut(e: FocusEvent) {
      const next = e.relatedTarget as Node | null
      if (next && (glassRef.current?.contains(next) || anchorEl?.contains(next))) return
      onClose()
    }
    anchorEl.addEventListener('focusout', onFocusOut)
    return () => anchorEl.removeEventListener('focusout', onFocusOut)
  }, [anchor, onClose])

  const position = useAnchoredBox(anchor, side, 0, POPOVER_GAP_PX)
  // `useAnchoredBox`'s own `left` is the anchor's unclamped edge (width 0 skips
  // its clamp); the DC insets 12px off each side of the anchor's own width, so
  // both `left` and `width` are read here, off the anchor's own rect (initial,
  // then resize/scroll), and override `position`'s `left` below.
  const [box, setBox] = useState<{ left: number; width: number }>()
  useLayoutEffect(() => {
    const el = resolveAnchorBox(anchor)
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setBox({ left: r.left + POPOVER_INSET_PX, width: Math.max(0, r.width - POPOVER_INSET_PX * 2) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  if (typeof document === 'undefined') return null
  const style = position && box ? { ...position, ...box } : undefined
  return createPortal(
    <div
      ref={glassRef}
      data-part="popover"
      className="mn-glass fixed z-[100] box-border rounded-[18px] p-[8px] font-sans text-mn-text"
      style={style}
    >
      <div data-part="head" className={HEAD}>
        pages
      </div>
      <div role="listbox" aria-label="pages">
        {items.map((item, index) => {
          const active = index === activeIndex
          return (
            <div
              key={item.id}
              role="option"
              aria-selected={active}
              data-part="row"
              className={`${ROW} ${active ? 'bg-mn-text/[0.07]' : 'bg-transparent'}`}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(item)}
            >
              <AreaMark glyph={item.glyph} color={item.color} />
              <span data-part="label" className="min-w-0 truncate font-medium">
                {item.label}
              </span>
              <span data-part="sub" className={SUB}>
                {item.sub}
              </span>
              <span className="flex-1" />
              {active && (
                <span data-part="enter" className={ENTER}>
                  ↵
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}
