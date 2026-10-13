'use client'

import { useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

/**
 * The drifting ASCII pond — five lines on the cover (`Pond 05 Shell` 5a /
 * `Pond 06.04` 6d f1), four behind the empty shell's hints (6d f2, `opacity`
 * .14 there vs the cover's .18) — each on its own `pondDrift`/`pondBreathe`
 * loop (duration and delay per line, board values), purely decorative.
 * `prefers-reduced-motion` stops the drift outright, read the same way
 * `use-below-md.ts` reads its own media query.
 */

interface AsciiLineAnimation {
  driftSeconds: number
  driftDelaySeconds: number
  breatheSeconds: number
  breatheDelaySeconds: number
}

/** Timing is keyed by line index and shared by every frame that uses this background. */
const LINE_ANIMATIONS: readonly AsciiLineAnimation[] = [
  { driftSeconds: 9, driftDelaySeconds: 0, breatheSeconds: 7, breatheDelaySeconds: 0 },
  { driftSeconds: 11.4, driftDelaySeconds: 0.7, breatheSeconds: 8.8, breatheDelaySeconds: 0.7 },
  { driftSeconds: 10.2, driftDelaySeconds: 1.4, breatheSeconds: 7.9, breatheDelaySeconds: 1.4 },
  { driftSeconds: 12.1, driftDelaySeconds: 2.1, breatheSeconds: 9.4, breatheDelaySeconds: 2.1 },
  { driftSeconds: 9.8, driftDelaySeconds: 2.8, breatheSeconds: 8.2, breatheDelaySeconds: 2.8 },
]

const COVER_LINES: readonly string[] = [
  ' ·≈∾-···  ···~≈∾·                  ··~≈∾-·   ····~·                  ·∿··~≈·  ',
  '~≈∾··  ··∿··~·                  ·∿··~≈·   ·—·∿··                  ·—·∿···   ··',
  '  ·—·∿···   ··~≈∾·                 ····~≈∾-·  ·∿··~·                 ··≈∾-·· ',
  '·∿··~≈·   ·—·∿···                  ·—·∿···   ·≈∾-··                 ~≈∾··  ··',
  ' ··~≈∾-·   ····~·                  ·∿··~≈·   ··≈∾-·                  ·—·∿·· ',
]

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const subscribeReducedMotion = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(REDUCED_MOTION_QUERY)
  list.addEventListener('change', notify)
  return () => list.removeEventListener('change', notify)
}

const getReducedMotionSnapshot = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches

const getReducedMotionServerSnapshot = () => false

export interface AsciiPondBackgroundProps {
  /** Each line's text, in board order. Defaults to the cover's five lines (5a / 6d f1). */
  lines?: readonly string[]
  /** Per-line opacity (board value — the cover is `.18`, the empty shell behind `FirstRunHints` is `.14`). */
  opacity?: number
  className?: string
}

export function AsciiPondBackground({
  lines = COVER_LINES,
  opacity = 0.18,
  className,
}: AsciiPondBackgroundProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 flex flex-col justify-center overflow-hidden whitespace-pre text-center text-[15px] leading-[2.6] text-mn-text',
        className
      )}
      style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.22em' }}
    >
      {lines.map((text, index) => {
        const anim = LINE_ANIMATIONS[index]
        return (
          <div
            key={index}
            style={{
              opacity,
              animation: reducedMotion
                ? undefined
                : `pondDrift ${anim.driftSeconds}s ease-in-out ${anim.driftDelaySeconds}s infinite alternate, pondBreathe ${anim.breatheSeconds}s ease-in-out ${anim.breatheDelaySeconds}s infinite alternate`,
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}
