'use client'

/**
 * The composer card's resize handle: a grip riding the card's top edge. Dragging
 * it up grows the card (pointer capture), ↑/↓ nudge it, Home/End jump to the
 * bounds, and a double-click returns it to the default height. The parent
 * owns the state and persistence (`useComposerHeight`): clamped live changes
 * through `onHeightChange`, one gesture-end commit through `onHeightCommit`.
 *
 * The card may be at its default when a gesture starts, so the start height and
 * the ceiling are measured from the card and its shell rather than passed in.
 */

import type { RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import {
  COMPOSER_HEIGHT_STEP,
  COMPOSER_MIN_HEIGHT,
  clampComposerHeight,
  composerMaxHeight,
} from '@/lib/layout/composer-height'

export interface ComposerHandleProps {
  /** The card being resized — measured at the start of each gesture. */
  cardRef: RefObject<HTMLElement | null>
  /** The user-set height, or null while the card sits at its default. */
  height: number | null
  /** Live height updates during a drag (clamped before delivery). */
  onHeightChange: (height: number) => void
  /** Fired once when a gesture ends — persist here. `null` returns the card to its default. */
  onHeightCommit: (height: number | null) => void
}

export const ComposerHandle = ({
  cardRef,
  height,
  onHeightChange,
  onHeightCommit,
}: ComposerHandleProps) => {
  // Captured move/up/cancel events reach the grip even off its strip; pointerId
  // matching keeps a second pointer from jittering the drag; `lastHeight` is
  // what up/cancel commit, since pointercancel can carry garbage coordinates.
  const dragState = useRef<{
    pointerId: number
    startY: number
    startHeight: number
    max: number
    lastHeight: number
  } | null>(null)

  const releaseBodyStyles = () => {
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }

  // Unmounting mid-drag must not leave the page stuck in ns-resize / no-select.
  useEffect(
    () => () => {
      if (dragState.current) releaseBodyStyles()
    },
    []
  )

  const measure = useCallback(() => {
    const card = cardRef.current
    const shell = card?.closest<HTMLElement>('[data-part="shell"]')
    return {
      current: height ?? card?.offsetHeight ?? COMPOSER_MIN_HEIGHT,
      max: composerMaxHeight(shell?.clientHeight ?? window.innerHeight),
    }
  }, [cardRef, height])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (dragState.current) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture can fail for already-released pointers; the drag still works over the grip */
      }
      const { current, max } = measure()
      dragState.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: current,
        max,
        lastHeight: current,
      }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'
    },
    [measure]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current
      if (!drag || e.pointerId !== drag.pointerId) return
      // The card is anchored at the bottom: dragging up (a smaller clientY) grows it.
      const next = clampComposerHeight(drag.startHeight + (drag.startY - e.clientY), drag.max)
      drag.lastHeight = next
      onHeightChange(next)
    },
    [onHeightChange]
  )

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current
      if (!drag || e.pointerId !== drag.pointerId) return
      dragState.current = null
      releaseBodyStyles()
      onHeightCommit(drag.lastHeight)
    },
    [onHeightCommit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { current, max } = measure()
      let next: number | null = null
      if (e.key === 'ArrowUp') next = current + COMPOSER_HEIGHT_STEP
      else if (e.key === 'ArrowDown') next = current - COMPOSER_HEIGHT_STEP
      else if (e.key === 'Home') next = COMPOSER_MIN_HEIGHT
      else if (e.key === 'End') next = max
      if (next === null) return
      e.preventDefault()
      onHeightCommit(clampComposerHeight(next, max))
    },
    [measure, onHeightCommit]
  )

  const handleDoubleClick = useCallback(() => onHeightCommit(null), [onHeightCommit])

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize composer"
      aria-valuemin={COMPOSER_MIN_HEIGHT}
      {...(height === null ? {} : { 'aria-valuenow': height })}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      data-part="composer-handle"
      className="group absolute inset-x-0 top-[-13px] z-10 flex h-4 cursor-ns-resize touch-none items-center justify-center outline-none"
    >
      <span className="h-1 w-10 rounded-full bg-mn-text-secondary/40 transition-colors group-hover:bg-mn-text group-focus-visible:bg-mn-text" />
    </div>
  )
}
