'use client'

/**
 * PondBlock (#237 frame · #238 states) — the card every block on a page renders in,
 * measured off `PondBlock.dc.html`'s inline `renderVals()`:
 *
 *   block    width W · padding 16px 18px · radius 20 · gap 12 · card paper ·
 *            --mn-shadow-card · sans · full ink
 *   W        list 400 · checklist 400 · table 500 · gallery 580 · number 400 ·
 *            log 460 · properties 400
 *   head     flex · baseline · space-between · gap 12
 *   eyebrow  10.5 / 500 / .1em / uppercase / ink .68 — `pageEyebrowClass` (#220)
 *   headMeta mono 10.5 / ink .68
 *
 * States (#238), each read straight out of the board:
 *
 *   hover     the CARD does not change — `block.boxShadow` is `cardShadow`, same as
 *             rest. One child row goes into the molecule's `hover` state at the
 *             board's `R` index (`POND_BLOCK_HOVER_ROW`); a body reads which via the
 *             pure `blockRowState(kind, state, i)`. The product never sets this:
 *             PondMolecule's own row hover is already live — `state="hover"` is a
 *             board-parity demo state.
 *   selected  boxShadow `0 0 0 2px ${fg}, ${cardShadow}` — a 2px FULL-INK ring
 *             prepended to the card shadow, both present (`ring-2 ring-mn-text`
 *             composes with `shadow-mn-card`). Gallery's record-card 1 goes `selected`.
 *   loading   headNote → `loading…`; the body → a STATIC skeleton (no sweep, pulse
 *             or shimmer): bars `display block · height h · width w · radius 5 ·
 *             rgba(ink,.08)` in a column with gap 2 (0 for table). The card root
 *             carries `aria-busy` — it is the region being updated.
 *   error     the body → PondMolecule's `notice` with `action="reconnect"` and the
 *             kind's exact copy (`blockErrorLine`). The head keeps its normal note.
 *   disabled  `opacity: .4` is the only pixel change. The card is also `inert`:
 *             the body is a LIVE module view, so a disabled block must take no
 *             clicks, no text entry and no Tab — `inert` removes the subtree from
 *             hit-testing and the focus order together, which `pointer-events`
 *             alone would not.
 *   empty     #239 — falls through to rest here.
 *   deleted   #240 (the tombstone) — falls through to rest here.
 *
 * The module view renders as `children`, untouched: the card is chrome AROUND the
 * engine, never a rewrite of it.
 */

import type { ReactNode } from 'react'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { type PondBlockKind, type PondBlockState } from '@/lib/modules/block-frame'
import { cn } from '@/lib/utils'

export {
  POND_BLOCK_KINDS,
  POND_BLOCK_WIDTHS,
  POND_BLOCK_STATES,
  POND_BLOCK_HOVER_ROW,
  blockRowState,
  type PondBlockKind,
  type PondBlockState,
} from '@/lib/modules/block-frame'

/**
 * Literal class strings per kind (Tailwind scans source for arbitrary values, so
 * these can't be built from the number). `POND_BLOCK_WIDTHS` is the one source;
 * the stories assert each computed width equals it.
 */
const WIDTH_CLASS: Record<PondBlockKind, string> = {
  list: 'w-[400px]',
  checklist: 'w-[400px]',
  table: 'w-[500px]',
  gallery: 'w-[580px]',
  number: 'w-[400px]',
  log: 'w-[460px]',
  properties: 'w-[400px]',
}

/** The board's `headMeta`: the mono note on the right of the head row. */
export const blockHeadNoteClass = 'font-mono text-[10.5px] text-mn-text-secondary'

/** The board's `loading` note — one-character ellipsis (U+2026). */
export const BLOCK_LOADING_NOTE = 'loading…'

/**
 * The board's `skel` per kind, as `[width, height]` literal class pairs (Tailwind
 * needs the literals in source). `sk(w, h = 10)`:
 *   number  → sk('60%', 52), sk('40%')
 *   gallery → sk('100%', 120), sk('50%')
 *   else    → sk('82%'), sk('64%'), sk('74%')
 */
type SkeletonBar = readonly [width: string, height: string]
const TEN_BARS: readonly SkeletonBar[] = [
  ['w-[82%]', 'h-[10px]'],
  ['w-[64%]', 'h-[10px]'],
  ['w-[74%]', 'h-[10px]'],
]
export const POND_BLOCK_SKELETON: Record<PondBlockKind, readonly SkeletonBar[]> = {
  list: TEN_BARS,
  checklist: TEN_BARS,
  table: TEN_BARS,
  log: TEN_BARS,
  properties: TEN_BARS,
  number: [
    ['w-[60%]', 'h-[52px]'],
    ['w-[40%]', 'h-[10px]'],
  ],
  gallery: [
    ['w-full', 'h-[120px]'],
    ['w-[50%]', 'h-[10px]'],
  ],
}

/**
 * The board's row stack gap per kind — `gap: 0` for table (its rows draw their own
 * rule), 2 for everything else. Literal class strings so Tailwind sees them; the
 * skeleton and a demo body both read this one table.
 */
export const POND_BLOCK_ROW_GAP: Record<PondBlockKind, string> = {
  list: 'gap-[2px]',
  checklist: 'gap-[2px]',
  table: 'gap-0',
  gallery: 'gap-[2px]',
  number: 'gap-[2px]',
  log: 'gap-[2px]',
  properties: 'gap-[2px]',
}

/** The board's `errLine` per kind, verbatim — curly apostrophes (U+2019) included. */
const SHEET_ERROR = 'pond can’t reach this sheet any more · showing the last copy'
const BLOCK_ERROR = 'this block couldn’t load'
export const POND_BLOCK_ERROR_LINE: Record<PondBlockKind, string> = {
  list: BLOCK_ERROR,
  checklist: BLOCK_ERROR,
  table: SHEET_ERROR,
  gallery: SHEET_ERROR,
  number: SHEET_ERROR,
  log: BLOCK_ERROR,
  properties: BLOCK_ERROR,
}

export function blockErrorLine(kind: PondBlockKind): string {
  return POND_BLOCK_ERROR_LINE[kind]
}

export interface PondBlockProps {
  kind: PondBlockKind
  /** The eyebrow — sans uppercase, the block's name or kind. */
  heading: string
  /** The mono note — a count, a source, a status. Omit for the board's `number`. */
  headNote?: string
  /** @default 'rest' — `empty` (#239) and `deleted` (#240) render as rest for now. */
  state?: PondBlockState
  children: ReactNode
  className?: string
}

export function PondBlock({
  kind,
  heading,
  headNote = '',
  state = 'rest',
  children,
  className,
}: PondBlockProps) {
  const selected = state === 'selected'
  const loading = state === 'loading'
  const error = state === 'error'
  const disabled = state === 'disabled'

  let body: ReactNode
  if (loading) {
    body = (
      <div data-part="skeleton" className={cn('flex flex-col', POND_BLOCK_ROW_GAP[kind])}>
        {POND_BLOCK_SKELETON[kind].map(([w, h], i) => (
          <span key={i} aria-hidden className={cn('block rounded-[5px] bg-mn-text/[0.08]', w, h)} />
        ))}
      </div>
    )
  } else if (error) {
    // The board's notice is 440 wide even in a 400 card; clamp to the content box
    // the way the frame clamps its own width — never overflow the paper.
    body = (
      <PondMolecule
        kind="notice"
        action="reconnect"
        title={blockErrorLine(kind)}
        className="max-w-full"
      />
    )
  } else {
    body = children
  }

  return (
    <div
      data-block-kind={kind}
      data-block-state={state}
      // `aria-busy` marks the region being updated — the card, not the skeleton
      // (whose children are all aria-hidden).
      aria-busy={loading || undefined}
      // A real boolean attribute (React 19): present when disabled, absent otherwise.
      inert={disabled || undefined}
      className={cn(
        // The column can be narrower than the kind (mobile, a dragged-in editor
        // width): clamp to it rather than overflow. Mobile's own 360 is a later slice.
        'relative flex max-w-full flex-col gap-mn-3 rounded-mn-card bg-mn-card px-[18px] py-mn-4 font-sans text-mn-text shadow-mn-card',
        WIDTH_CLASS[kind],
        // selected: the ring is PREPENDED to the card shadow (Tailwind composes
        // --tw-ring-shadow before --tw-shadow), so both paint — as the board draws.
        selected && 'ring-2 ring-mn-text',
        disabled && 'opacity-40',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-mn-3">
        <span className={pageEyebrowClass}>{heading}</span>
        <span className={blockHeadNoteClass}>{loading ? BLOCK_LOADING_NOTE : headNote}</span>
      </div>
      {body}
    </div>
  )
}
