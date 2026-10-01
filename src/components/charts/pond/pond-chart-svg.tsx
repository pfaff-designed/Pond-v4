'use client'

import type { ReactNode } from 'react'
import { useMeasuredWidth } from './use-measured-width'

export interface PondChartSvgProps {
  /** Pixel height, fixed or derived from the measured width. */
  height: number | ((width: number) => number)
  /** Accessible name for the drawing ("Bar chart of Hours by Month"). */
  label: string
  /** The drawing, given the measured width and resolved height; null when there is nothing to draw. */
  children: (width: number, height: number) => ReactNode | null
  /** Rendered in the frame's place when the drawing returns null (an empty-state notice). */
  fallback?: ReactNode
  className?: string
}

/**
 * The responsive SVG frame every PondChart kind draws into. Measures its own width
 * (the card decides how wide a chart is; the chart never does), resolves the
 * height, and arrives with the house `mn-arrive` motion — which collapses to its
 * end state under `prefers-reduced-motion` via the one consolidated contract in
 * `globals.css`. `overflow: visible` so edge labels (the mockups set theirs at
 * y=3.5 and y=148 of 150) are never clipped.
 */
export function PondChartSvg({ height, label, children, fallback, className }: PondChartSvgProps) {
  const [measure, width] = useMeasuredWidth<HTMLDivElement>()
  const h = typeof height === 'function' ? height(width) : height
  const drawn = width > 0 ? children(width, h) : null
  return (
    <div ref={measure} className={['mn-arrive w-full', className].filter(Boolean).join(' ')}>
      {width > 0 && drawn === null && fallback}
      {width > 0 && drawn !== null && (
        <svg
          width={width}
          height={h}
          viewBox={`0 0 ${width} ${h}`}
          role="img"
          aria-label={label}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {drawn}
        </svg>
      )}
    </div>
  )
}
