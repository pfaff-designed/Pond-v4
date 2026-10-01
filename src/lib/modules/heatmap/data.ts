import type { HeatmapCell } from '../view/heatmap-data'

/**
 * Honest text summary for `serialize` (the prompt body + embedding source):
 * day count, total, and the peak day — so the AI's context matches what the user
 * sees without dumping every cell. Mirrors `summarizeChart` (chart/data.ts):
 * head + optional title, ` — caption`, then the figures.
 */
export function summarizeHeatmap(data: {
  title?: string
  caption?: string
  cells: readonly HeatmapCell[]
}): string {
  const head = `Heatmap${data.title ? ` "${data.title}"` : ''}`
  if (data.cells.length === 0) return `${head}: (no data)`
  let total = 0
  let peak = data.cells[0]
  for (const cell of data.cells) {
    total += cell.value
    if (cell.value > peak.value) peak = cell
  }
  const cap = data.caption ? ` — ${data.caption}` : ''
  const days = `${data.cells.length} ${data.cells.length === 1 ? 'day' : 'days'}`
  return `${head} over ${days}${cap}; total ${total}, peak ${peak.value} on ${peak.date}`
}
