'use client'

/**
 * PondBlock (#237 frame · #238 states · #239 empty · #240 deleted) — the card every
 * block on a page renders in, measured off `PondBlock.dc.html`'s inline `renderVals()`:
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
 *   empty     (#239) the body → `emptyBox`: flex · center · space-between · gap 12 ·
 *             padding 14 · radius 14 · rgba(ink,.035) ground, holding `emptyText`
 *             (13.5 / ink .68, sans inherited) with the kind's lowercase line
 *             (`POND_BLOCK_EMPTY`) and, on the right, the offered action as the
 *             existing secondary pill at the board's 32px. Rows, the gallery grid
 *             and the big number are all suppressed; the head keeps its NORMAL
 *             note. The action renders only when `onEmptyAction` is wired — a
 *             choice is offered or it is not drawn, never faked as a dead button.
 *   deleted   (#240) the tombstone — the ONE state that is not a card: `background:
 *             transparent` and `boxShadow: inset 0 0 0 1.4px rgba(ink,.2)` — a SOLID
 *             inset hairline ring (`ring-[1.4px] ring-inset ring-mn-text/20`, the
 *             same hairline PondMolecule's empty record-card wears), no card paper,
 *             no card shadow, NOT dashed. The object is gone, so its ground is gone.
 *             Width is 460 for EVERY kind (`POND_BLOCK_TOMB_WIDTH`) — the only state
 *             that overrides the kind's width. The head keeps the kind's heading and
 *             its note becomes `database deleted`. The body → `tomb`: a column at
 *             gap 12 holding `tombText` (mono 11 / 1.55 / ink .8 — the META tier,
 *             not the note's .68) with the board's sentence, then `tombActions`
 *             (flex, gap 8): `restore` as the secondary pill and `remove block` as
 *             the ghost, both at 32px, each drawn only when its callback is wired
 *             (7a: past the window, remove is the only action). Rows, gallery, big
 *             number, skeleton, notice and empty box are all suppressed.
 *             Presentation only: nothing in the schema can set it yet — the date,
 *             window and the name of what was deleted ride props (#199).
 *
 * The module view renders as `children`, untouched: the card is chrome AROUND the
 * engine, never a rewrite of it.
 */

import type { ReactNode } from 'react'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import type { PondMenuSize } from '@/components/molecules/PondMenu'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { Button } from '@/components/ui/button'
import {
  blockEmptyCopy,
  blockErrorLine,
  blockTombLine,
  POND_BLOCK_ROW_GAP,
  POND_BLOCK_SKELETON,
  POND_BLOCK_TOMB_NOTE,
  type BlockEmptyBox,
  type PondBlockKind,
  type PondBlockState,
} from '@/lib/modules/block-frame'
import { cn } from '@/lib/utils'

// Every pure per-kind table lives in `block-frame.ts` (the React-free module);
// re-exported here so the frame's call sites import one name.
export {
  POND_BLOCK_KINDS,
  POND_BLOCK_WIDTHS,
  POND_BLOCK_STATES,
  POND_BLOCK_HOVER_ROW,
  POND_BLOCK_EMPTY,
  POND_BLOCK_FILTERED_EMPTY_LINE,
  POND_BLOCK_SKELETON,
  POND_BLOCK_ROW_GAP,
  POND_BLOCK_ERROR_LINE,
  POND_BLOCK_TOMB_WIDTH,
  POND_BLOCK_TOMB_NOTE,
  POND_BLOCK_TOMB_FIXTURE,
  blockEmptyCopy,
  blockEmptyBox,
  blockErrorLine,
  blockRowState,
  blockTombLine,
  type BlockEmptyBox,
  type PondBlockKind,
  type PondBlockState,
} from '@/lib/modules/block-frame'

/**
 * Block width (ADR 0008): every block FILLS the content column — `w-full`, clamped
 * by the base `max-w-full`. The board's per-kind `W` map (`POND_BLOCK_WIDTHS`) is
 * retained as the board record but no longer governs layout; do NOT re-wire it into
 * the card width "to match the board" (ADR 0004: that is the re-litigation this
 * guards against). The deleted tombstone is the one carve-out — it keeps its board
 * width, below.
 */

/** `POND_BLOCK_TOMB_WIDTH` (460) as its literal class — the tombstone keeps its board width (ADR 0008 carve-out). */
const TOMB_WIDTH_CLASS = 'w-[460px]'

/** The board's `headMeta`: the mono note on the right of the head row. */
export const blockHeadNoteClass = 'font-mono text-[10.5px] text-mn-text-secondary'

/** The board's `loading` note — one-character ellipsis (U+2026). */
export const BLOCK_LOADING_NOTE = 'loading…'

/**
 * The two state recipes a card that is NOT a block shell still shares with it
 * (#227: the chart card). ONE owner each — a second spelling in another file
 * would drift the day either value moved.
 *
 *   selected  `0 0 0 2px ${fg}, ${cardShadow}` — Tailwind v4 composes
 *             `--tw-ring-shadow` BEFORE `--tw-shadow`, so `ring-2 ring-mn-text`
 *             beside `shadow-mn-card` paints the ring first, both present, in both
 *             themes (`--mn-text` flips; `--mn-shadow-card` is redefined for dark).
 *   disabled  `opacity: .4` is the only pixel change; the consumer also sets `inert`.
 */
export const POND_BLOCK_SELECTED_RING = 'ring-2 ring-mn-text'
/** The selected ring on a card-less surface (bare prose, a lane-drawing board): there is
 *  no card edge for the ring to follow, so it carries its own `rounded-[20px]` (KAN-367). */
export const POND_BLOCK_SELECTED_RING_ROUNDED = cn(POND_BLOCK_SELECTED_RING, 'rounded-[20px]')
export const POND_BLOCK_DISABLED = 'opacity-40'

/**
 * The board's `emptyBox` + `emptyText` (#239), bare: the ink-.035 ground at radius
 * 14 and padding 14, the kind's lowercase line at 13.5 / ink .68 (15 below `md`, per
 * `PondBlock.dc.html`'s `mob` branch), and — only when `onAction` is wired — the
 * offered action as the existing secondary pill (`h-8` = the board's 32px desktop,
 * `h-11` below `md` per `PondControl.dc.html`'s `mob` branch). Exported so a surface
 * rendering UNDER the frame with its own degenerate case (the chart card) draws the
 * same box rather than a sentence-case line of its own. The ground is
 * `bg-mn-text/[0.035]` — a wash, not an ink tier; the line sits on the third tier
 * (`--mn-text-secondary`, .68).
 *
 * `line` overrides the kind's line when the kind's copy would be FALSE about the
 * data — a filter matching nothing over rows that exist, a chart with points but no
 * numeric series. `action` names the offered action for a surface that is not a
 * block kind (#227: the chart card's `add a row`); else `kind` names it, and with
 * neither there is none.
 *
 * `box` (#259) picks which empty box the board draws. `PondBlock.dc.html` has one;
 * `PondTemplate.dc.html` adds the `voidBox` for the compact chart marks that are
 * empty as a hole: `height 72 · flex · center · center · radius 12 · inset 0 0 0
 * 1.4px ink .14 · mono 11 / ink .68`. The void box has no action slot — the board
 * centres its one line and draws nothing else — so an `onAction` is not drawn in
 * it. One component, two boxes: not a second empty-state component.
 */
export function PondBlockEmpty({
  kind,
  line,
  action,
  box = 'box',
  onAction,
  className,
}: {
  kind?: PondBlockKind
  line?: string
  action?: string
  box?: BlockEmptyBox
  onAction?: () => void
  className?: string
}) {
  const copy = kind ? blockEmptyCopy(kind) : undefined
  const text = line ?? copy?.line
  const actionLabel = action ?? copy?.action
  const recipe = EMPTY_BOX[box]
  return (
    <div data-part="empty" data-empty-box={box} className={cn(recipe.box, className)}>
      <span className={recipe.text}>{text}</span>
      {box === 'box' && onAction && actionLabel && (
        <Button
          variant="secondary"
          onClick={onAction}
          className="h-11 px-5 text-[14px] md:h-8 md:px-[14px] md:text-[12px]"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

/**
 * The two empty boxes' class recipes. The `text` strings mix a SIZE with a COLOUR
 * and are composed as plain literals, never through `cn` (#252: tailwind-merge
 * cannot tell `text-[11px]` from `text-mn-text-secondary` in every form and
 * drops one). `ring-mn-text/[0.14]` is the board's `inset 0 0 0 1.4px a(.14)`.
 */
const EMPTY_BOX: Record<BlockEmptyBox, { box: string; text: string }> = {
  box: {
    box: 'flex items-center justify-between gap-mn-3 rounded-mn-inner bg-mn-text/[0.035] p-[14px]',
    text: 'text-[15px] md:text-[13.5px] text-mn-text-secondary',
  },
  void: {
    box: 'flex h-[72px] items-center justify-center rounded-[12px] ring-[1.4px] ring-inset ring-mn-text/[0.14]',
    text: 'font-mono text-[11px] text-mn-text-secondary',
  },
}

export interface PondBlockProps {
  kind: PondBlockKind
  /** The eyebrow — sans uppercase, the block's name or kind. */
  heading: string
  /** The mono note — a count, a source, a status. Omit for the board's `number`. */
  headNote?: string
  /** @default 'rest' */
  state?: PondBlockState
  /**
   * The next step the empty state offers (#239) — `add a row`, `add a step`… —
   * wired by the host to the module's own insert path. Omit it and the empty
   * line renders alone: an action is offered or it is not drawn, never disabled.
   */
  onEmptyAction?: () => void
  /**
   * Overrides the kind's empty line when that line would be false about the data —
   * `nothing matches this filter` over rows the filter hides. Omit it for the
   * board's `EL` copy.
   */
  emptyLine?: string
  /**
   * Which empty box the board draws (#259): the `emptyBox` (default) or, for a
   * compact bar strip, `PondTemplate.dc.html`'s `voidBox`. `blockEmptyBox()` reads
   * it off the block.
   */
  emptyBox?: BlockEmptyBox
  /**
   * KAN-321: a views-shaped block's saved-view bar, kept reachable when the
   * active saved view's own filter empties the card — `empty` swaps `children`
   * (the module view, bar included) for `PondBlockEmpty`, so without this slot
   * a filtered-empty saved view has no tab back to one that isn't. Rendered
   * above the body in EVERY state the host passes it for; the host only wires
   * it while `state === 'empty'`, since every other state already draws the
   * bar inside `children`.
   */
  headBar?: ReactNode
  /**
   * The tombstone's facts (#240). What the view showed — the deleted DATABASE for a
   * view block (7a), defaulting to `heading` — and when it went and for how long it
   * can come back. All three are fixtures until #199 lands `deleted_at` and the
   * trash window; the defaults are the board's `22 sep` / `30 days`.
   */
  deletedName?: string
  deletedOn?: string
  restoreWindow?: string
  /**
   * The tombstone's two ways out (7a): bring the database back, or take the stone
   * off the page. Each button is drawn only when its callback is wired — past the
   * window, `remove block` is the only action. #199 supplies the real paths.
   */
  onRestore?: () => void
  onRemoveBlock?: () => void
  /**
   * KAN-259: on phone the handle sits INSIDE the card at `right 2 · top 2 ·
   * 44x44`, so the head row reserves 40px on its right — otherwise the handle
   * covers the eyebrow or headNote at 390px. Desktop (`@default`) is unaffected,
   * since that handle sits outside the card at `left -14`.
   */
  size?: PondMenuSize
  /**
   * KAN-442: the card is a set pixel height. The head stays put. `pane` scrolls
   * this card's body (an image, a table). `self` lets the body — a view — scroll
   * its own contents and keep its bar fixed.
   */
  constrained?: boolean
  bodyScroll?: 'pane' | 'self'
  children: ReactNode
  className?: string
}

export function PondBlock({
  kind,
  heading,
  headNote = '',
  state = 'rest',
  onEmptyAction,
  emptyLine,
  emptyBox = 'box',
  headBar,
  deletedName,
  deletedOn,
  restoreWindow,
  onRestore,
  onRemoveBlock,
  size = 'desktop',
  constrained = false,
  bodyScroll = 'pane',
  children,
  className,
}: PondBlockProps) {
  const selected = state === 'selected'
  const empty = state === 'empty'
  const loading = state === 'loading'
  const error = state === 'error'
  const tombed = state === 'deleted'
  const disabled = state === 'disabled'

  let body: ReactNode
  if (tombed) {
    body = (
      <div data-part="tomb" className="flex flex-col gap-mn-3">
        <span
          data-part="tomb-line"
          className="font-mono text-mn-11 leading-[1.55] text-mn-text-meta"
        >
          {blockTombLine(deletedName ?? heading, deletedOn, restoreWindow)}
        </span>
        {(onRestore || onRemoveBlock) && (
          <div data-part="tomb-actions" className="flex gap-mn-2">
            {onRestore && (
              <Button variant="secondary" onClick={onRestore}>
                restore
              </Button>
            )}
            {onRemoveBlock && (
              <Button variant="ghost" onClick={onRemoveBlock}>
                remove block
              </Button>
            )}
          </div>
        )}
      </div>
    )
  } else if (empty) {
    body = <PondBlockEmpty kind={kind} line={emptyLine} box={emptyBox} onAction={onEmptyAction} />
  } else if (loading) {
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
        // Every block FILLS the content column (ADR 0008): `w-full`, with `max-w-full`
        // so a narrow column (mobile, a dragged-in editor width) clamps rather than
        // overflows. Mobile's own 360 is a later slice.
        'relative flex w-full max-w-full flex-col gap-mn-3 rounded-mn-card px-[18px] py-mn-4 font-sans text-mn-text',
        // deleted: no paper, no shadow — a solid inset hairline on transparent, at
        // 460 whatever the kind (the one width carve-out). `TOMB_WIDTH_CLASS` is appended
        // after the base `w-full`, so `cn` dedupes width to the tombstone's 460. Everything
        // else fills the column.
        tombed
          ? ['bg-transparent ring-[1.4px] ring-inset ring-mn-text/20', TOMB_WIDTH_CLASS]
          : 'bg-mn-card shadow-mn-card',
        // selected: the ring is PREPENDED to the card shadow (Tailwind composes
        // --tw-ring-shadow before --tw-shadow), so both paint — as the board draws.
        selected && POND_BLOCK_SELECTED_RING,
        disabled && POND_BLOCK_DISABLED,
        constrained && 'h-full min-h-0 overflow-hidden',
        className
      )}
    >
      <div
        data-part="block-head"
        className={cn(
          'flex items-baseline justify-between gap-mn-3',
          size === 'mobile' && 'pr-10',
          constrained && 'shrink-0'
        )}
      >
        <span className={pageEyebrowClass}>{heading}</span>
        <span className={blockHeadNoteClass}>
          {loading ? BLOCK_LOADING_NOTE : tombed ? POND_BLOCK_TOMB_NOTE : headNote}
        </span>
      </div>
      {headBar && (
        <div data-part="block-bar" className={cn(constrained && 'shrink-0')}>
          {headBar}
        </div>
      )}
      {constrained ? (
        <div
          data-part="block-body"
          className={cn(
            bodyScroll === 'self' && 'flex min-h-0 flex-1 flex-col overflow-hidden',
            bodyScroll === 'pane' && 'min-h-0 flex-1 overflow-y-auto'
          )}
        >
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  )
}
