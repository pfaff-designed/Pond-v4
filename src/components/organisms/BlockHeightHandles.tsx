'use client'

/**
 * The top and bottom edges of a view, image or chart (KAN-442). An 8px strip,
 * `ns-resize`, with a 40×2 pill that fades in on hover at ink .2 and goes full
 * ink while dragging. Nothing is drawn at rest. Release writes one height;
 * locking to fit clears it. Esc cancels.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { blockDomId } from '@/lib/modules/block-dom'
import {
  HEIGHT_BODY_MIN_PX,
  HEIGHT_SHIFT_STEP_PX,
  HEIGHT_STEP_PX,
  heightFitMemory,
  measureBlockHeightBounds,
  snapBlockHeight,
  stepBlockHeight,
  type HeightGuide,
  type SnappedHeight,
} from '@/lib/modules/block-height'
import { cn } from '@/lib/utils'

export type HeightCommit = { clear: true } | { height: number }

interface Neighbour {
  id: string
  label: string
}

export interface BlockHeightHandlesProps {
  /** The sized card — measured at the start of a gesture. */
  sizeRef: RefObject<HTMLElement | null>
  /** The stored height, or null while the block sits at its content. */
  height: number | null
  /** The card's content height, remembered while it was unsized. */
  rememberedFitRef: RefObject<number | null>
  neighbours: readonly Neighbour[]
  onPreview: (height: number) => void
  onCommit: (result: HeightCommit) => void
  onCancel: () => void
}

type Edge = 'top' | 'bottom'

interface Drag {
  pointerId: number
  edge: Edge
  startY: number
  startHeight: number
  min: number
  guides: HeightGuide[]
  last: SnappedHeight
  moved: boolean
}

const STRIP =
  'group/edge absolute inset-x-0 z-[2] h-2 cursor-ns-resize touch-none outline-none focus-visible:outline-none'

export function BlockHeightHandles({
  sizeRef,
  height,
  rememberedFitRef,
  neighbours,
  onPreview,
  onCommit,
  onCancel,
}: BlockHeightHandlesProps) {
  const dragRef = useRef<Drag | null>(null)
  const [draggingEdge, setDraggingEdge] = useState<Edge | null>(null)
  const [readout, setReadout] = useState<string | null>(null)
  const [minNow, setMinNow] = useState(HEIGHT_BODY_MIN_PX)

  const releaseBodyStyles = () => {
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }

  useEffect(
    () => () => {
      if (dragRef.current) releaseBodyStyles()
    },
    []
  )

  const bounds = useCallback(() => {
    const root = sizeRef.current
    if (!root) return { fit: height ?? HEIGHT_BODY_MIN_PX, min: HEIGHT_BODY_MIN_PX }
    const remembered = heightFitMemory(height, root.offsetHeight, rememberedFitRef.current)
    return measureBlockHeightBounds(root, remembered)
  }, [height, rememberedFitRef, sizeRef])

  const neighbourGuides = useCallback((): HeightGuide[] => {
    return neighbours.flatMap((neighbour) => {
      const node = document.getElementById(blockDomId(neighbour.id))
      const measured = node?.offsetHeight ?? 0
      if (measured <= 0) return []
      return [{ height: measured, label: neighbour.label }]
    })
  }, [neighbours])

  const endDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current
      dragRef.current = null
      setDraggingEdge(null)
      setReadout(null)
      releaseBodyStyles()
      if (!drag || !commit || !drag.moved) {
        onCancel()
        return
      }
      if (drag.last.lockedTo === 'fit') onCommit({ clear: true })
      else onCommit({ height: drag.last.height })
    },
    [onCancel, onCommit]
  )

  useEffect(() => {
    if (!draggingEdge) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      endDrag(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [draggingEdge, endDrag])

  const handlePointerDown = (edge: Edge) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* capture can fail for an already-released pointer */
    }
    event.currentTarget.focus()
    const measured = bounds()
    const startHeight = height ?? measured.fit
    setMinNow(measured.min)
    dragRef.current = {
      pointerId: event.pointerId,
      edge,
      startY: event.clientY,
      startHeight,
      min: measured.min,
      guides: [{ height: measured.fit, label: 'fit' }, ...neighbourGuides()],
      last: { height: startHeight, readout: '', lockedTo: null },
      moved: false,
    }
    setDraggingEdge(edge)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const delta = drag.edge === 'bottom' ? event.clientY - drag.startY : drag.startY - event.clientY
    if (delta !== 0) drag.moved = true
    const snapped = snapBlockHeight(drag.startHeight + delta, drag.min, drag.guides)
    drag.last = snapped
    setReadout(snapped.readout)
    onPreview(snapped.height)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    endDrag(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (dragRef.current) return
    const step = event.shiftKey ? HEIGHT_SHIFT_STEP_PX : HEIGHT_STEP_PX
    let delta: number | null = null
    if (event.key === 'ArrowUp') delta = step
    else if (event.key === 'ArrowDown') delta = -step
    if (delta === null) return
    event.preventDefault()
    event.stopPropagation()
    const measured = bounds()
    setMinNow(measured.min)
    const current = height ?? measured.fit
    onCommit({ height: stepBlockHeight(current, delta, measured.min) })
  }

  const value = height ?? undefined

  return (
    <>
      {(['top', 'bottom'] as const).map((edge) => (
        <div
          key={edge}
          role="separator"
          aria-orientation="horizontal"
          aria-label={
            edge === 'top' ? 'Resize height from the top' : 'Resize height from the bottom'
          }
          aria-valuemin={minNow}
          aria-valuenow={value}
          aria-valuetext={readout ?? (height == null ? 'fit' : `${height}px`)}
          tabIndex={0}
          data-part="height-handle"
          data-edge={edge}
          onPointerDown={handlePointerDown(edge)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={STRIP}
          style={edge === 'top' ? { top: -4 } : { bottom: -4 }}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 left-1/2 h-[2px] w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mn-text/20 opacity-0 transition-opacity duration-[150ms] ease-[var(--ease-mn)]',
              'group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100',
              draggingEdge === edge && 'bg-mn-text opacity-100'
            )}
          />
        </div>
      ))}
      {readout && draggingEdge && (
        <span
          data-part="height-readout"
          className="pointer-events-none absolute left-1/2 z-[3] -translate-x-1/2 rounded-full bg-mn-card px-2 py-[2px] font-mono text-[11px] tracking-tight text-mn-text lowercase shadow-mn-sm"
          style={draggingEdge === 'bottom' ? { bottom: 12 } : { top: 12 }}
        >
          {readout}
        </span>
      )}
    </>
  )
}
