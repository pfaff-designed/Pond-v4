'use client'

/**
 * The composer's `@` picker (`PondComposer.dc.html`'s `popover`, KAN-99):
 * headed `pages`, each row a page's mark, title and area. Presentational —
 * the host owns `activeIndex`, the `@`-query narrowing and the keyboard.
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
 */

import { AreaMark } from '@/components/atoms/AreaMark'
import { ENTER } from './slash-row'

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

export interface PageMentionPickerProps {
  items: readonly PageMentionItem[]
  activeIndex: number
  onHover: (index: number) => void
  onPick: (item: PageMentionItem) => void
}

const HEAD =
  'px-[10px] pt-[4px] pb-[8px] font-sans text-[10.5px] font-medium tracking-[.1em] uppercase text-mn-text-secondary'

const ROW =
  'flex cursor-default items-center gap-[10px] rounded-[14px] px-[10px] py-[8px] font-sans text-[13px] text-mn-text'

const SUB = 'min-w-0 truncate text-[12.5px] text-mn-text-secondary'

export function PageMentionPicker({ items, activeIndex, onHover, onPick }: PageMentionPickerProps) {
  return (
    <div data-part="popover" className="mn-glass box-border rounded-[18px] p-[8px] font-sans text-mn-text">
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
    </div>
  )
}
