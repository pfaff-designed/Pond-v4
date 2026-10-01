/**
 * PondChart drawing constants — every value is read inline from
 * `wayfinder/design_handoff_pond/pond-charts.js` (the plots `PondChart.dc.html`
 * renders), not chosen here. Colours are the `--chart-*` tokens from `globals.css`
 * so both themes resolve without a single literal in the chart code.
 */

/** Ink stroke / solid fill (paper on the dark card). */
export const INK = 'var(--chart-1)'
/** Scatter dots (.7 in the mockup → the .72 ramp step). */
export const INK_DOT = 'var(--chart-2)'
/** Reference lines such as a budget (.55 in the mockup → the .5 ramp step). */
export const INK_REFERENCE = 'var(--chart-3)'
/** Composed-chart bars (.18). */
export const INK_BAR = 'var(--chart-5)'
/** Gauge progress, the strongest ranked fill (.85). */
export const FILL_STRONG = 'var(--chart-fill-strong)'
/** Radar area (.12). */
export const FILL_AREA = 'var(--chart-fill-area)'
/** Gauge track, sankey flows (.07). */
export const FILL_SOFT = 'var(--chart-fill-soft)'
/** Net chart below-zero band (.045). */
export const FILL_BAND = 'var(--chart-fill-band)'
/** Grid lines, spokes, radar rings (.09). */
export const GRID = 'var(--chart-grid)'
/** The zero line of a net chart (.4). */
export const ZERO_LINE = 'var(--chart-crosshair)'
/** Tick labels (.68). */
export const LABEL = 'var(--chart-label)'
/** Axis names, flow labels + nodes, radar axes (.8). */
export const LABEL_STRONG = 'var(--chart-label-strong)'
/** The chart's own ground — hollow markers and the hairline between flows. */
export const GROUND = 'var(--chart-background)'

export const FONT_LABEL = 10
export const FONT_LABEL_SMALL = 9.5
export const FONT_NUMERAL = 34

export const STROKE_LINE = 1.6
export const STROKE_RADAR = 1.5
export const STROKE_PROJECTION = 1.4
export const STROKE_TREND = 1.2
export const DASH_SEGMENT = '3 3'
export const DASH_PROJECTION = '2 4'

/** Cartesian plot frame: 318 wide → 284 plot + 34 right gutter for y labels; 150 tall → 8 top, labels at 148. */
export const RIGHT_GUTTER = 34
export const TOP_PAD = 8
export const BOTTOM_PAD = 18
/** y-label x offset from the plot's right edge, and its baseline nudge. */
export const Y_LABEL_DX = 6
export const Y_LABEL_DY = 3.5

/** The mockup's natural height; cartesian kinds grow with width up to a cap. */
export const BASE_HEIGHT = 150
export const MAX_HEIGHT = 260

/** Height for a cartesian plot at a given width: the mockup's 150 at card width, 2:5 beyond. */
export function cartesianHeight(width: number): number {
  return Math.round(Math.min(MAX_HEIGHT, Math.max(BASE_HEIGHT, width * 0.4)))
}
