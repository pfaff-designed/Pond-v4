'use client'

import { type MotionValue, motion } from 'motion/react'
import { type RefObject, useId } from 'react'

// Hover-highlight overlay: re-strokes the base path `d`, clipped to a vertical
// band whose x/width spring to track the hovered point, so only the segment
// around the dot shows brighter. The band comes from `useHighlightSegment`;
// because the bright stroke reuses the base `d`, it follows whatever curve is
// drawn (see `highlight-segment-bounds.ts` for the band-extent caveat).

export interface HighlightSegmentProps {
  /** Ref to the rendered base stroke `<path>` — its `d` is re-used verbatim. */
  pathRef: RefObject<SVGPathElement | null>
  /** Whether to render (caller gates on showHighlight + active + loaded). */
  visible: boolean
  stroke: string
  strokeWidth: number
  /** Plot height — the clip band spans it fully. */
  height: number
  /** Spring-eased left edge of the clip band (px). */
  x: MotionValue<number>
  /** Spring-eased width of the clip band (px). */
  width: MotionValue<number>
}

export function HighlightSegment({
  pathRef,
  visible,
  stroke,
  strokeWidth,
  height,
  x,
  width,
}: HighlightSegmentProps) {
  const clipId = useId()
  // Reads the series path element's live geometry during render to clone its `d`
  // for the highlight overlay — the path is drawn by a sibling and its ref is stable
  // for this frame, so reading `.current` here is intentional (ticket-36 lint
  // cleanup — was a biome-ignore).
  // eslint-disable-next-line react-hooks/refs -- intentional: mirror the sibling path's geometry for the highlight clone
  if (!(visible && pathRef.current)) {
    return null
  }
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <motion.rect height={height} width={width} x={x} y={0} />
        </clipPath>
      </defs>
      <motion.path
        animate={{ opacity: 1 }}
        clipPath={`url(#${clipId})`}
        // eslint-disable-next-line react-hooks/refs -- intentional: clone the sibling path's live `d` (see note above)
        d={pathRef.current.getAttribute('d') || ''}
        exit={{ opacity: 0 }}
        fill="none"
        initial={{ opacity: 0 }}
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
    </>
  )
}

HighlightSegment.displayName = 'HighlightSegment'

export default HighlightSegment
