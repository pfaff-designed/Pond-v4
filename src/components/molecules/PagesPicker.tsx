'use client'

/**
 * The composer's `@` picker (`PondComposer.dc.html`'s `popover`, KAN-99):
 * headed `pages`, each row a page's mark, title and area. The host owns
 * `activeIndex` and the `@`-query narrowing; this component owns only the
 * keys that work it and where it sits.
 *
 * `PondPicker` kind "pages" (round 3, conductor-approved): the glass is
 * `COMPOSER_POP.glass`, the head `COMPOSER_POP.head`, and every row is
 * `slash-row.tsx`'s `Row` with `chrome={COMPOSER_POP.row}` — the shared
 * `PondPicker` row/chrome (`picker-chrome.ts`), not a hand-rolled list (two
 * Pond-level components doing one job is a duplicate, AGENTS.md). Every
 * literal in `COMPOSER_POP` is `PondComposer.dc.html`'s `specVals()` (board
 * 6e frame 3) — see `picker-chrome.ts`'s own doc comment for the board
 * values. `Row`'s `mark` prop carries the page's `AreaMark`/`KindDot`
 * (same choice `ReferencesRow`/the rail make) inside its 13×13 icon slot;
 * `entry.hit`/`post` are empty — 6e frame 3 draws no match underline — and
 * `entry.hint` is never set, so the selected row's `↵` is the only trailing
 * mark (`Row`'s own selected/hint branch).
 *
 * The glass listens on the document in the capture phase so ↑↓↵esc reach it
 * before the composer's own textarea, which never loses focus (`SourcePicker
 * .tsx`'s own pattern). It portals to `document.body` at a fixed box off the
 * anchor's rect. The anchor is the composer's own visible card — `Terminal
 * Drawer`'s `[data-part="composer-card"]`, the element that carries the glass
 * whether or not a thread is open above it — not a transparent child of it
 * (the line, or the footer group alone), so that sitting above it (the usual
 * case: the composer sits at the foot of the screen) clears the thread and
 * the references row's current-page chip rather than covering either. The
 * DC's `sPop` sits `bottom: calc(100% + 10px)` off that glass, inset
 * `left: 12, right: 12` — a 10px gap (`POPOVER_GAP_PX`, not
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
import { KindDot } from '@/components/atoms/PondAtom'
import { COMPOSER_POP } from './picker-chrome'
import { Row, type RowEntry } from './slash-row'
import { useAnchoredBox, type PickerSide } from './use-anchored-box'

export interface PageMentionItem {
  id: string
  /** The page's mark glyph, from `resolveMark` — null draws the plain `KindDot`, same as `ReferencesRow`/the rail. */
  glyph: string | null
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

export interface PagesPickerProps {
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

/** `PondComposer.dc.html`'s `sPop`: `bottom: calc(100% + 10px)` off the anchor. */
const POPOVER_GAP_PX = 10
/** `PondComposer.dc.html`'s `sPop`: `left: 12, right: 12` off the anchor. */
const POPOVER_INSET_PX = 12
/** `COMPOSER_POP.row`'s measured height (`py-[8px]` + the `text-[13px]` line) — an
 * unfiltered `@` can list every page in the pond, so the row list caps at six and
 * scrolls the rest, per `MENTION_POPOVER_ESTIMATE_PX`'s own "up to six rows". */
const ROW_HEIGHT_PX = 35.5
const MAX_VISIBLE_ROWS = 6

/** The anchor's live value, ref or raw — the one place both effects below (and the width effect) read it from. */
function resolveAnchorBox(anchor: MentionAnchor): MentionAnchorBox | null {
  return anchor && 'current' in anchor ? anchor.current : anchor
}

/** The anchor as a real element, when it is one — the test fixtures' plain `{getBoundingClientRect}` objects aren't. */
function resolveAnchorElement(anchor: MentionAnchor): HTMLElement | null {
  const el = resolveAnchorBox(anchor)
  return el && typeof (el as Partial<HTMLElement>).contains === 'function' ? (el as unknown as HTMLElement) : null
}

function toRowEntry(item: PageMentionItem): RowEntry {
  return { kind: 'row', id: item.id, label: item.label, pre: item.label, hit: '', post: '', sub: item.sub }
}

export function PagesPicker({
  items,
  activeIndex,
  onHover,
  onPick,
  onClose,
  anchor,
  side = 'bottom',
}: PagesPickerProps) {
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
  const activeRowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

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
    <div ref={glassRef} data-part="popover" className={COMPOSER_POP.glass} style={style}>
      <div data-part="head" className={COMPOSER_POP.head}>
        pages
      </div>
      <div
        role="listbox"
        aria-label="pages"
        className="overflow-y-auto"
        style={{ maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT_PX }}
      >
        {items.map((item, index) => {
          const active = index === activeIndex
          return (
            <div key={item.id} ref={active ? activeRowRef : undefined}>
              <Row
                entry={toRowEntry(item)}
                selected={active}
                onHover={() => onHover(index)}
                onPick={() => onPick(item)}
                chrome={COMPOSER_POP.row}
                mark={
                  item.glyph ? (
                    <AreaMark glyph={item.glyph} color={item.color} />
                  ) : (
                    <KindDot accent={item.color} className={!item.color ? 'bg-mn-text/50' : undefined} />
                  )
                }
              />
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}
