'use client'

import { useSpring } from 'motion/react'
import { useMemo, useRef } from 'react'
import { useChartConfig } from './chart-config-context'
import { useChartHover, useChartStable } from './chart-context'
import { computeSegmentBounds, INACTIVE_SEGMENT } from './highlight-segment-bounds'

// Hover-highlight band for `line.tsx` and `area.tsx`. Computes the segment
// bounds and springs its x/width; `<HighlightSegment>` renders the clipped
// re-stroke. Spring tuning comes from `ChartConfigProvider.highlightSpring`.
// Stable + hover slices are read separately so callers can see the exact
// subscription surface (anything calling this hook will re-render on hover).

export interface HighlightSegmentResult {
  xSpring: ReturnType<typeof useSpring>
  widthSpring: ReturnType<typeof useSpring>
  isActive: boolean
}

/**
 * @param enabled set false when there is no stroke to highlight (e.g. an area
 *   with `showLine={false}`); defaults true.
 */
export function useHighlightSegment({
  enabled = true,
}: {
  enabled?: boolean
} = {}): HighlightSegmentResult {
  const { data, xScale, xAccessor } = useChartStable()
  const { tooltipData, selection } = useChartHover()
  const { highlightSpring } = useChartConfig()

  const bounds = useMemo(
    () =>
      enabled
        ? computeSegmentBounds(data, xScale, xAccessor, tooltipData, selection)
        : INACTIVE_SEGMENT,
    [enabled, data, xScale, xAccessor, tooltipData, selection]
  )

  const xSpring = useSpring(0, highlightSpring)
  const widthSpring = useSpring(0, highlightSpring)

  // Jump on inactive→active so the band appears at the hovered point instead
  // of sliding in from x=0; ease on subsequent moves. Reading and writing
  // `wasActive.current` during render is the intended edge-detector for this
  // one-frame transition (ticket-36 lint cleanup — was biome-ignores).
  const wasActive = useRef(false)
  // eslint-disable-next-line react-hooks/refs -- render-time edge detector (inactive→active)
  if (bounds.isActive && !wasActive.current) {
    xSpring.jump(bounds.x)
    widthSpring.jump(bounds.width)
  } else {
    xSpring.set(bounds.x)
    widthSpring.set(bounds.width)
  }
  // eslint-disable-next-line react-hooks/refs -- render-time edge detector (see note above)
  wasActive.current = bounds.isActive

  return { xSpring, widthSpring, isActive: bounds.isActive }
}
