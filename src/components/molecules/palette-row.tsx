'use client'

/**
 * One row of the ⌘K palette — `PondPicker kind="palette"` (#279). ADR 0004 §4:
 * the rows are SANS, because a page's name is page content quoted inside a
 * machine surface; the chrome around them stays mono. Not the `/` menu's row
 * (`slash-row.tsx`): that one is mono 12.5 at radius 10, this one sans 13.5 at
 * radius 14, and ADR 0003's third amendment keeps the two apart.
 *
 * Every literal is `wayfinder/board-values.generated.json`
 * `.components.PondPicker.variants["kind=palette|theme=paper"]`:
 *
 *   row      flex · gap 10 · 9px 12px (mobile 13px 12px) · radius 14 · sans 13.5 (mobile 15) ·
 *            tracking 0
 *            page / database / record / pond at full ink; action at ink .8
 *            selected: ink .07
 *   label    500 when the row leads with a glyph, else 400 · nowrap · ellipsis
 *   glyph    13 × 13 mask over currentColor — the `Icon` atom, a page's own mark
 *   svg      the board's `db` mark, 13 × 13 on a 14 grid at 1.4, in a wrap at ink .8
 *   >        an action's lead, mono 12.5
 *   sub      INLINE after the name · 12.5 (mobile 13) · ink .68 · nowrap · ellipsis
 *   hint     0 1 auto · max 45% · mono 10.5 · ink .68 — hidden on the selected row
 *   ↵        mono 10.5 · ink .8 — on the selected row
 *   match    underline · offset 3 · thickness 1, over #278's `pre` / `hit` / `post`
 *
 * `hint`, `enter` and `match` are not kind-specific — the board emits them once,
 * outside its per-kind branch — so they are `slash-row.tsx`'s `HINT`, `ENTER` and
 * `MATCH`, imported beside `Mark`. Only `ROW` and `SUB` are this kind's own.
 * Class strings are template literals, not `cn()` (#252).
 */

import { Icon } from '@/components/atoms/Icon'

import type { PaletteEntry } from './palette-entries'
import { ICON } from './slash-entries'
import { ENTER, HINT, MATCH, Mark } from './slash-row'

export type PaletteRowEntry = Extract<PaletteEntry, { kind: 'row' }>

const ROW =
  'flex cursor-default items-center gap-[10px] rounded-[14px] px-[12px] py-[13px] font-sans text-[15px] tracking-[0] md:py-[9px] md:text-[13.5px]'
const SUB = 'min-w-0 truncate text-[13px] text-mn-text-secondary md:text-[12.5px]'

export function PaletteRow({
  id,
  entry,
  selected,
  onHover,
  onPick,
}: {
  id: string
  entry: PaletteRowEntry
  selected: boolean
  onHover: () => void
  onPick: () => void
}) {
  const { item } = entry
  const isAction = item.kind === 'action'
  const isData = item.kind === 'record' || item.kind === 'database'
  const glyph = !isAction && !isData ? item.glyph : undefined
  const ink = isAction ? 'text-mn-text-meta' : 'text-mn-text'
  const wash = selected ? 'bg-mn-text/[0.07]' : 'bg-transparent'
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-part="row"
      data-kind={item.kind}
      className={`${ROW} ${ink} ${wash}`}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      {glyph && <Icon name={glyph} />}
      {isData && (
        <span data-part="icon" className="flex text-mn-text-meta">
          <Mark d={ICON.db.d} />
        </span>
      )}
      {isAction && (
        <span data-part="act-mark" className="font-mono text-[12.5px]">
          &gt;
        </span>
      )}
      <span
        data-part="label"
        className={`min-w-0 truncate ${glyph ? 'font-medium' : 'font-normal'}`}
      >
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
        item.key && (
          <span data-part="hint" className={HINT}>
            {item.key}
          </span>
        )
      )}
    </div>
  )
}
