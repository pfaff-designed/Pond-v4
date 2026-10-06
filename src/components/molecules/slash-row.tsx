'use client'

/**
 * One row of a `PondPicker` glass and the hand-drawn mark that leads it (#278).
 * `SlashMenu` draws the `/` menu with it and the source picker (#280) draws the
 * same row, so it lives here once rather than restated per kind.
 *
 * Every literal is `wayfinder/board-values.generated.json` `.components.PondPicker`:
 *
 *   row     flex · gap 10 · 7px 10px · radius 10 · mono 12.5 · .01em · ink; selected ink .07
 *           mobile: 11px 10px at 14
 *           `faint` (the source picker's `field` add row): the row at ink .8
 *   svg     13 × 13 on a 14 grid · stroke currentColor 1.4 round · at ink .8
 *   sub     INLINE after the label · mono 10.5 · ink .68 · nowrap · ellipsis
 *   hint    0 1 auto · max 45% · mono 10.5 · ink .68 · ellipsis — hidden on the selected row
 *   ↵       mono 10.5 · ink .8 — on the selected row
 *   match   underline · offset 3 · thickness 1, over a `pre` / `hit` / `post` split
 *
 * `hint`, `enter` and `match` are the three the board emits ONCE, outside its
 * per-kind branch (`PondPicker.dc.html`'s `renderVals()`): they are not kind-
 * specific, unlike the row's padding, radius and face. So they are exported from
 * here and the palette's sans row (`palette-row.tsx`, #279) imports them beside
 * `Mark` rather than restating them.
 *
 * Class strings are template literals, not `cn()` (#252).
 */

import type { ReactNode } from 'react'

import { SLASH_SIZES, type PickerSize } from './picker-chrome'
import type { SlashEntry } from './slash-entries'

export type RowEntry = Extract<SlashEntry, { kind: 'row' }>

/** The board's `sub` on a mono row: inline after the label. */
const SUB = 'min-w-0 truncate text-[10.5px] text-mn-text-secondary'
/** The board's `hint`: the key at rest, at the row's end. */
export const HINT =
  'min-w-0 max-w-[45%] flex-[0_1_auto] truncate font-mono text-[10.5px] text-mn-text-secondary'
/** The board's `enter`: `↵` on the selected row, where the hint was. */
export const ENTER = 'font-mono text-[10.5px] text-mn-text-meta'
/** The board's `match`: the underlined `hit` of a `pre` / `hit` / `post` split. */
export const MATCH = 'underline decoration-[1px] underline-offset-[3px]'

export function Row({
  entry,
  selected,
  onHover,
  onPick,
  size = 'desktop',
}: {
  entry: RowEntry
  selected: boolean
  /** @default 'desktop' */
  size?: PickerSize
  onHover: () => void
  onPick: () => void
}) {
  const ink = entry.faint ? 'text-mn-text-meta' : 'text-mn-text'
  return (
    <div
      role="option"
      aria-selected={selected}
      data-part="row"
      className={`${SLASH_SIZES[size].row} ${ink} ${selected ? 'bg-mn-text/[0.07]' : 'bg-transparent'}`}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      {entry.icon && (
        <span data-part="icon" className="flex text-mn-text-meta">
          <Mark d={entry.icon.d} filled={entry.icon.filled} />
        </span>
      )}
      <span data-part="label" className="min-w-0 truncate font-normal">
        <span data-part="pre">{entry.pre}</span>
        <span data-part="hit" className={MATCH}>
          {entry.hit}
        </span>
        <span data-part="post">{entry.post}</span>
      </span>
      {entry.sub && (
        <span data-part="sub" className={SUB}>
          {entry.sub}
        </span>
      )}
      <span className="flex-1" />
      {selected ? (
        <span data-part="enter" className={ENTER}>
          ↵
        </span>
      ) : (
        entry.hint && (
          <span data-part="hint" className={HINT}>
            {entry.hint}
          </span>
        )
      )}
    </div>
  )
}

/** The board's hand-drawn mark: 13 × 13 on a 14 grid, stroke 1.4, round caps — or filled. */
export function Mark({ d, filled }: { d: string; filled?: boolean }): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}
