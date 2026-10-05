'use client'

/**
 * One progress value for an element that morphs between two shapes in place —
 * `PondCommand`'s rest ↔ open (`command-palette.md`, `PondCommand.dc.html`).
 *
 * `t` runs 0 (rest) → 1 (open). Each frame writes the EASED value to the element
 * as the CSS variable `--e`, and every animated property is a CSS function of it,
 * so a frame costs no React render. React hears only the two crossings it draws
 * differently: past halfway (`half`), and fully at rest (`atRest`).
 *
 *   open    280ms · cubic-bezier(.22,.8,.2,1)
 *   close   150ms · cubic-bezier(.4,0,1,1)
 *
 * A reversal mid-way continues from the current `t`, and the duration scales by
 * the distance left. Reduced motion jumps straight to the end.
 */

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export const MORPH_OPEN_MS = 280
export const MORPH_CLOSE_MS = 150

/** A CSS cubic-bezier as a function of x, solved by bisection (the board's own `bez`). */
const bezier = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
  let lo = 0
  let hi = 1
  let t = x
  for (let i = 0; i < 22; i++) {
    t = (lo + hi) / 2
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
    if (cx < x) lo = t
    else hi = t
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
}

const easePress = bezier(0.22, 0.8, 0.2, 1)
const easeIn = bezier(0.4, 0, 1, 1)

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

interface MorphPhase {
  /** The eased value is past .5 — the open layers take the pointer. */
  half: boolean
  /** `t` is exactly 0: nothing of the open shape is drawn. */
  atRest: boolean
}

/**
 * `at` freezes `t` there instead of animating — the board's still frames
 * (`PondCommand` t = 0 · .25 · .5 · 1), eased on the opening curve as it draws them.
 */
export function useMorph(ref: RefObject<HTMLElement | null>, open: boolean, at?: number) {
  const start = at ?? (open ? 1 : 0)
  const t = useRef(start)
  const [phase, setPhase] = useState<MorphPhase>({
    half: easePress(start) > 0.5,
    atRest: start === 0,
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = t.current
    const to = at ?? (open ? 1 : 0)
    const opening = at !== undefined || to > from
    const duration =
      at !== undefined || prefersReducedMotion()
        ? 0
        : (opening ? MORPH_OPEN_MS : MORPH_CLOSE_MS) * Math.abs(to - from)
    const began = performance.now()
    let frame = 0

    const paint = (k: number) => {
      t.current = from + (to - from) * k
      const e = opening ? easePress(t.current) : 1 - easeIn(1 - t.current)
      el.style.setProperty('--e', String(e))
      const next = { half: e > 0.5, atRest: t.current === 0 }
      setPhase((prev) => (prev.half === next.half && prev.atRest === next.atRest ? prev : next))
    }
    const step = (now: number) => {
      const k = Math.min(1, (now - began) / duration)
      paint(k)
      if (k < 1) frame = requestAnimationFrame(step)
    }

    if (duration === 0) paint(1)
    else frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [ref, open, at])

  return phase
}
