'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Live pixel width of a container, via a callback ref that wires a
 * `ResizeObserver` as the node mounts — the same pattern the gantt track uses
 * (`view.tsx`). 0 until measured, which the chart frames treat as "not yet
 * drawable" (jsdom never measures; the real render is covered by story tests).
 */
export function useMeasuredWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)
  const measure = useCallback((el: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    const read = () => setWidth(Math.floor(el.getBoundingClientRect().width))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    observerRef.current = ro
  }, [])
  return [measure, width]
}
