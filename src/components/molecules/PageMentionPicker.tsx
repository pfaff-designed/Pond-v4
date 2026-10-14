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
 * anchor's rect. The DC's `sPop` is `left: 12, right: 12` off the composer —
 * the composer's own width, not a fixed picker width like `SourcePicker`'s
 * 300/340 — so the glass's width is read straight off the anchor's own rect
 * rather than `useAnchoredBox`'s width-clamp param: that param clamps `left`
 * against a glass width independent of its anchor, which this glass never
 * has (its width IS its anchor's).
 */

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
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
        const item = items[activeIndex]
        if (item) onPick(item)
      } else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  const position = useAnchoredBox(anchor, side, 0)
  // `useAnchoredBox` only tracks top/bottom/left; the glass's width is its
  // anchor's own, read the same way (initial rect, then resize/scroll).
  const [width, setWidth] = useState<number>()
  useLayoutEffect(() => {
    const el = anchor && 'current' in anchor ? anchor.current : anchor
    if (!el) return
    const update = () => setWidth(el.getBoundingClientRect().width)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  if (typeof document === 'undefined') return null
  const style = position && width !== undefined ? { ...position, width } : undefined
  return createPortal(
    <div
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
