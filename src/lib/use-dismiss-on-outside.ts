'use client'

/**
 * A press outside an open menu or modal closes it. The listener is on
 * `document` in the capture phase, so a press on the shell (not only the page
 * canvas) counts, and a child that stops the bubble cannot keep it open.
 * Anything inside one of `roots` stays open — include the trigger when it sits
 * outside the popup, or the trigger's own click reopens what this just closed.
 */

import { useEffect, useRef, type RefObject } from 'react'

export function useDismissOnOutside(
  active: boolean,
  onDismiss: () => void,
  roots: ReadonlyArray<RefObject<HTMLElement | null>>,
  keepOpen?: (target: Element) => boolean
) {
  const onDismissRef = useRef(onDismiss)
  const rootsRef = useRef(roots)
  const keepOpenRef = useRef(keepOpen)

  useEffect(() => {
    onDismissRef.current = onDismiss
    rootsRef.current = roots
    keepOpenRef.current = keepOpen
  })

  useEffect(() => {
    if (!active) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootsRef.current.some((root) => root.current?.contains(target))) return
      if (target instanceof Element && keepOpenRef.current?.(target)) return
      onDismissRef.current()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [active])
}
