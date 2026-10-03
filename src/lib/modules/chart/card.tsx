'use client'

/**
 * PondChart (#227) — the card every chart KIND renders inside, measured off
 * `PondChart.dc.html`'s inline `renderVals()` (`wayfinder/board-values.generated.json`):
 *
 *   card     width 350 · padding 16px 16px 14px · radius 20 · gap 12 · card paper ·
 *            --mn-shadow-card · sans · full ink
 *   headRow  flex · baseline · space-between · gap 10
 *   title    sans 15 / 500 at full ink            the block's own label
 *   typeTag  MONO 10.5 / ink .8 / nowrap          `CHART_TYPE_TAG[kind]`
 *   sub      12.5 / ink .68 / margin-top -6       pulls under the title against gap 12
 *   plotBox  relative · padding 6px 0 2px · min-height 150 · overflow visible (the tip)
 *   tip      absolute top 2 / right 34 · column gap 3 · padding 8px 11px · radius 14 ·
 *            white glass gradient + white hairline + 0 8px 24px rgba(40,34,24,.12) ·
 *            MONO 11 / full ink · pointer-events none      (ink: 74,73,64 glass)
 *   foot     column gap 4 · padding-top 10 · 1px ink .055 top hairline · 11px
 *            footLabel width 38 / ink .68 · footVal ink .8 · footMono MONO 10.5 / ink .8
 *
 * The seven states (`CHART_CARD_STATES`), each read straight out of the board:
 *
 *   hover     THIS card's own: `translateY(-1px)` + the shadow swap
 *             (`0 2px 4px .06, 0 14px 32px .1`; ink `.34 / .4`) and the tip appears.
 *             The block shell's hover changes nothing — the lift stays in this file.
 *   selected  `0 0 0 2px ink, cardShadow` — CONSUMED from `PondBlock`
 *             (`POND_BLOCK_SELECTED_RING` + `shadow-mn-card`; ring before shadow).
 *   empty     the plot is hidden; `emptyBox` draws — the shared `PondBlockEmpty`
 *             ground (ink .035) at the chart's geometry: column · flex-start ·
 *             center · gap 12 · height 150 · padding 0 14 · radius 14 — with
 *             `no rows in {source} yet` (13.5 / ink .68) and `add a row`, drawn only
 *             when the host wires it (never a dead button).
 *   loading   the plot is hidden; the four-bar skeleton draws (`CHART_SKELETON`).
 *   error     the plot stays, faded to opacity .45; PondMolecule's `notice` with
 *             `can’t reach {source} · showing the last copy` and `reconnect`.
 *   disabled  `opacity .4` + `inert` — CONSUMED from `PondBlock` (`POND_BLOCK_DISABLED`).
 *             No `aria-disabled`: on a generic div AT ignores it (#238).
 *
 * The plot renders as `children`, untouched: the card is chrome AROUND Bklit's
 * drawing, never a rewrite of it. Class strings that pair a SIZE with an ink TIER
 * are plain template literals, never `cn()` (#252).
 */

import type { ReactNode } from 'react'
import type { ChartKind } from '@/lib/modules/view/aggregate'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import {
  PondBlockEmpty,
  POND_BLOCK_DISABLED,
  POND_BLOCK_SELECTED_RING,
} from '@/components/organisms/PondBlock'
import {
  CHART_EMPTY_ACTION,
  CHART_ERROR_ACTION,
  CHART_FOOT_LABELS,
  CHART_SKELETON,
  CHART_TYPE_TAG,
  chartEmptyLine,
  chartErrorLine,
  type ChartCardState,
} from './chrome'

export {
  CHART_CARD_STATES,
  CHART_TYPE_TAG,
  CHART_EMPTY_ACTION,
  CHART_ERROR_ACTION,
  CHART_SKELETON,
  chartEmptyLine,
  chartErrorLine,
  type ChartCardState,
} from './chrome'

/**
 * The line for a chart that has rows but nothing numeric to draw — true where the
 * board's `no rows in … yet` would not be (#239 review; the host decides which
 * condition holds). Also the compact bar strip's voidBox line (#259).
 */
export const CHART_EMPTY_LINE = 'no data yet'

/**
 * A heatmap's one configuration prerequisite, stated once: a calendar cannot be read
 * off a category label. Owned here, beside the other shared chart copy, and read by
 * #259's compact grid so the same misconfiguration cannot read two different ways.
 *
 * `collection-chart.tsx`'s `HeatmapKind` still holds its own identical literal. That
 * is deliberate for now, not an oversight: the file is prettier-dirty on `main`, so
 * the husky hook reformats the whole thing on any commit that touches it, and the
 * reformat alone pushes it past `max-lines`. Adopt this constant there in a slice
 * already touching that file.
 */
export const HEATMAP_DATE_NOTICE = 'A heatmap reads one cell a day — pick a date field for “By”.'

/** The hover readout — the board's `tipA` (muted: the x) over `tipB` (the value). */
export interface ChartTip {
  a: string
  b: string
}

export interface ChartCardProps {
  kind: ChartKind
  /** The board's `title` — the block's own label. Omit it and the head keeps only the tag. */
  title?: string
  /** The board's `sub` — a description of the window. Omit it rather than invent one. */
  sub?: string
  /** The footer's `on` — the host page's path. Omit it off a page host. */
  on?: string
  /** The footer's `reads` — the source and its fields, in the mono voice. */
  reads?: string
  /** @default 'rest' */
  state?: ChartCardState
  /** The source the empty and error copy name; the board's `this table` when unknown. */
  source?: string
  /**
   * Overrides `no rows in {source} yet` when that would be false about the data —
   * rows exist but the filter hides them, or none carries a number. The host passes
   * `onEmptyAction` only when `add a row` is the honest action.
   */
  emptyLine?: string
  onEmptyAction?: () => void
  /** The hover readout. Drawn when given; the plots own hover, so the host decides. */
  tip?: ChartTip
  /** The plot. Hidden on `empty` and `loading`; faded to .45 on `error`. */
  children: ReactNode
  className?: string
}

// ── The board's class recipes ──────────────────────────────────────────────────

/** hover's shadow swap, live and forced — two spellings so Tailwind's scanner sees each literal. */
const HOVER_SHADOW =
  'shadow-[0_2px_4px_rgba(40,34,24,.06),0_14px_32px_rgba(40,34,24,.1)] dark:shadow-[0_2px_4px_rgba(0,0,0,.34),0_14px_32px_rgba(0,0,0,.4)]'
const HOVER_LIVE =
  'shadow-mn-card hover:transform-[translateY(-1px)] hover:shadow-[0_2px_4px_rgba(40,34,24,.06),0_14px_32px_rgba(40,34,24,.1)] dark:hover:shadow-[0_2px_4px_rgba(0,0,0,.34),0_14px_32px_rgba(0,0,0,.4)]'
const HOVER_FORCED = `transform-[translateY(-1px)] ${HOVER_SHADOW}`

/** The card's `box-shadow` + `transform` per state; `rest` is live to the pointer. */
const CARD_STATE: Record<ChartCardState, string> = {
  rest: HOVER_LIVE,
  hover: HOVER_FORCED,
  selected: `${POND_BLOCK_SELECTED_RING} shadow-mn-card`,
  empty: HOVER_LIVE,
  loading: HOVER_LIVE,
  error: HOVER_LIVE,
  disabled: `shadow-mn-card ${POND_BLOCK_DISABLED}`,
}

/**
 * The tip's glass, as the board draws it in each theme — its own recipe, not
 * `.mn-glass`: the light shadow is `0 8px 24px .12`, not the floating family's
 * `0 20px 54px`, and it is a readout inside a card, not an object over the canvas.
 */
const TIP =
  'pointer-events-none absolute top-[2px] right-[34px] flex flex-col gap-[3px] rounded-[14px] border border-[rgba(255,255,255,.9)] bg-[linear-gradient(160deg,rgba(255,255,255,.86),rgba(255,255,255,.64))] px-[11px] py-[8px] font-mono text-[11px] text-mn-text shadow-[0_8px_24px_rgba(40,34,24,.12)] dark:border-[rgba(250,249,239,.09)] dark:bg-[linear-gradient(160deg,rgba(74,73,64,.95),rgba(74,73,64,.82))] dark:shadow-[0_8px_24px_rgba(0,0,0,.4)]'

/** `emptyBox`'s geometry over the shared ground (`PondBlockEmpty`: ink .035, radius 14, gap 12). */
const EMPTY_GEOMETRY = 'h-[150px] flex-col items-start justify-center px-[14px] py-0'

const FOOT_LABEL = 'w-[38px] shrink-0 text-mn-text-secondary'

export function ChartCard({
  kind,
  title,
  sub,
  on,
  reads,
  state = 'rest',
  source,
  emptyLine,
  onEmptyAction,
  tip,
  children,
  className,
}: ChartCardProps) {
  const empty = state === 'empty'
  const loading = state === 'loading'
  const error = state === 'error'
  const disabled = state === 'disabled'
  const showPlot = !loading && !empty

  return (
    <div
      data-chart-kind={kind}
      data-chart-state={state}
      aria-busy={loading || undefined}
      // A real boolean attribute (React 19): present when disabled, absent otherwise.
      inert={disabled || undefined}
      className={`relative flex w-[350px] max-w-full flex-col gap-mn-3 rounded-mn-card bg-mn-card px-mn-4 pt-mn-4 pb-[14px] font-sans text-mn-text ${CARD_STATE[state]} ${className ?? ''}`}
    >
      <div data-part="head" className="flex items-baseline justify-between gap-[10px]">
        {title !== undefined && (
          <span data-part="title" className="text-[15px] font-medium">
            {title}
          </span>
        )}
        <span
          data-part="type"
          className="ml-auto font-mono text-[10.5px] whitespace-nowrap text-mn-text-meta"
        >
          {CHART_TYPE_TAG[kind]}
        </span>
      </div>
      {sub !== undefined && (
        <div data-part="sub" className="-mt-[6px] text-[12.5px] text-mn-text-secondary">
          {sub}
        </div>
      )}

      <div data-part="plot" className="relative min-h-[150px] overflow-visible pt-[6px] pb-[2px]">
        {showPlot && <div className={error ? 'opacity-[0.45]' : undefined}>{children}</div>}
        {tip && (
          <div data-part="tip" className={TIP}>
            <span className="text-mn-text-secondary">{tip.a}</span>
            <span>{tip.b}</span>
          </div>
        )}
        {loading && (
          <div data-part="skeleton" className="flex flex-col gap-mn-3 pt-[10px]">
            {CHART_SKELETON.map(([w, h], i) => (
              <span
                key={i}
                aria-hidden
                className={`block rounded-[6px] bg-mn-text/[0.08] ${w} ${h}`}
              />
            ))}
          </div>
        )}
        {empty && (
          <PondBlockEmpty
            line={emptyLine ?? chartEmptyLine(source)}
            action={CHART_EMPTY_ACTION}
            onAction={onEmptyAction}
            className={EMPTY_GEOMETRY}
          />
        )}
      </div>

      {error && (
        // The board's notice is 440 wide in a 318 content box; clamp to it the way
        // the block shell does (ADR 0004 ruling 7) — never overflow the paper.
        <PondMolecule
          kind="notice"
          action={CHART_ERROR_ACTION}
          title={chartErrorLine(source)}
          className="max-w-full"
        />
      )}

      {(on !== undefined || reads !== undefined) && (
        <div
          data-part="foot"
          className="flex flex-col gap-[4px] border-t border-mn-text/[0.055] pt-[10px] text-[11px]"
        >
          {on !== undefined && (
            <div data-part="on" className="flex gap-[10px]">
              <span className={FOOT_LABEL}>{CHART_FOOT_LABELS.on}</span>
              <span className="text-mn-text-meta">{on}</span>
            </div>
          )}
          {reads !== undefined && (
            <div data-part="reads" className="flex gap-[10px]">
              <span className={FOOT_LABEL}>{CHART_FOOT_LABELS.reads}</span>
              <span className="font-mono text-[10.5px] text-mn-text-meta">{reads}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The chart series ramp, re-exported from the chart layer's single definition
 * (`components/charts/chart-ramp.ts` ↔ `--chart-1…5` in globals.css) so the
 * module cards and the kind renderers can never disagree on a colour.
 */
export { CHART_SERIES_COLORS } from '@/components/charts/chart-ramp'
