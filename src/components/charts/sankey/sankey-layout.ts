/**
 * Sankey geometry — PondChart "sankey": ONE source (the total) flowing into a
 * node per category, largest first. Read from the mockup at 318 × 150: source
 * node at x 12, 6 wide, 10 → 128; target nodes 80px in from the right edge, each
 * flow a cubic whose control points meet at the horizontal midpoint; 2.4px of air
 * between target nodes.
 */
import type { FigurePoint } from '../pond/pond-chart-data'

export interface SankeyFlow {
  label: string
  value: number
  /** Rank by size (0 = largest) — drives the ranked fill. */
  rank: number
  /** Target node rectangle. */
  node: { x: number; y: number; w: number; h: number }
  /** The ribbon path from the source to the node. */
  path: string
  /** Label anchor beside the node. */
  lx: number
  ly: number
}
export interface SankeyLayout {
  total: number
  source: { x: number; y: number; w: number; h: number }
  flows: SankeyFlow[]
}

export const SANKEY_NODE_W = 6
export const SANKEY_LABEL_GUTTER = 80
/** Labels are 10px type; two thin adjacent flows must not print on top of each other. */
export const SANKEY_LABEL_MIN_GAP = 12
const SOURCE_X = 12
const TOP = 10
const BOTTOM = 22
const GAP = 2.4

/** Frame height: the mockup's 150, growing 22px per flow beyond six. */
export function sankeyHeight(flowCount: number): number {
  return Math.max(150, flowCount * 22 + TOP + BOTTOM)
}

const r = (n: number) => Math.round(n * 1000) / 1000

export function layoutSankey(
  points: readonly FigurePoint[],
  series: string,
  width: number,
  height: number
): SankeyLayout | null {
  const items = points
    .map((p) => ({ label: p.x, value: p.values[series] }))
    .filter((it): it is { label: string; value: number } => typeof it.value === 'number' && it.value > 0)
    .sort((a, b) => b.value - a.value)
  if (items.length === 0 || width <= SANKEY_LABEL_GUTTER + SOURCE_X * 2) return null

  const total = items.reduce((a, it) => a + it.value, 0)
  const span = height - TOP - BOTTOM
  const source = { x: SOURCE_X, y: TOP, w: SANKEY_NODE_W, h: span }
  const tx = width - SANKEY_LABEL_GUTTER
  const sx = SOURCE_X + SANKEY_NODE_W
  const mx = (sx + tx) / 2
  // Targets share the source's span minus the gaps, so the ribbons are read as the
  // source split up, not as a second quantity.
  const usable = span - GAP * (items.length - 1)

  let sy = TOP
  let ty = TOP - (GAP * (items.length - 1)) / 2
  let lastLabelY = -Infinity
  const flows: SankeyFlow[] = items.map((it, rank) => {
    const h = (it.value / total) * usable
    const sy0 = sy
    const sy1 = sy + (it.value / total) * span
    const ty0 = ty
    const ty1 = ty + h
    const path = `M${r(sx)},${r(sy0)} C${r(mx)},${r(sy0)} ${r(mx)},${r(ty0)} ${r(tx)},${r(ty0)} L${r(tx)},${r(ty1)} C${r(mx)},${r(ty1)} ${r(mx)},${r(sy1)} ${r(sx)},${r(sy1)} Z`
    sy = sy1
    ty = ty1 + GAP
    // Labels are nudged down past the previous label when a thin flow would collide;
    // the nodes and ribbons keep their true positions.
    const ly = Math.max(r((ty0 + ty1) / 2 + 3.5), lastLabelY + SANKEY_LABEL_MIN_GAP)
    lastLabelY = ly
    return {
      label: it.label,
      value: it.value,
      rank,
      node: { x: tx, y: r(ty0), w: SANKEY_NODE_W, h: r(h) },
      path,
      lx: tx + 12,
      ly,
    }
  })
  return { total, source, flows }
}
