'use client'

import { useSyncExternalStore } from 'react'

/**
 * The cover's drifting ASCII pond (`Pond 05 Shell` 5a / `Pond 06.04` 6d f1) —
 * five lines, each on its own `pondDrift`/`pondBreathe` loop (duration and
 * delay per line, board values), purely decorative behind the `ask pond`
 * field. `prefers-reduced-motion` stops the drift outright, read the same
 * way `use-below-md.ts` reads its own media query.
 */

interface AsciiLine {
  text: string
  driftSeconds: number
  driftDelaySeconds: number
  breatheSeconds: number
  breatheDelaySeconds: number
}

const LINES: AsciiLine[] = [
  {
    text: ' ·≈∾-···  ···~≈∾·                  ··~≈∾-·   ····~·                  ·∿··~≈·  ',
    driftSeconds: 9,
    driftDelaySeconds: 0,
    breatheSeconds: 7,
    breatheDelaySeconds: 0,
  },
  {
    text: '~≈∾··  ··∿··~·                  ·∿··~≈·   ·—·∿··                  ·—·∿···   ··',
    driftSeconds: 11.4,
    driftDelaySeconds: 0.7,
    breatheSeconds: 8.8,
    breatheDelaySeconds: 0.7,
  },
  {
    text: '  ·—·∿···   ··~≈∾·                 ····~≈∾-·  ·∿··~·                 ··≈∾-·· ',
    driftSeconds: 10.2,
    driftDelaySeconds: 1.4,
    breatheSeconds: 7.9,
    breatheDelaySeconds: 1.4,
  },
  {
    text: '·∿··~≈·   ·—·∿···                  ·—·∿···   ·≈∾-··                 ~≈∾··  ··',
    driftSeconds: 12.1,
    driftDelaySeconds: 2.1,
    breatheSeconds: 9.4,
    breatheDelaySeconds: 2.1,
  },
  {
    text: ' ··~≈∾-·   ····~·                  ·∿··~≈·   ··≈∾-·                  ·—·∿·· ',
    driftSeconds: 9.8,
    driftDelaySeconds: 2.8,
    breatheSeconds: 8.2,
    breatheDelaySeconds: 2.8,
  },
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

export function AsciiPondBackground() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex flex-col justify-center overflow-hidden whitespace-pre text-center font-mono text-[15px] leading-[2.6] tracking-[0.22em] text-mn-text"
    >
      {LINES.map((line, index) => (
        <div
          key={index}
          style={{
            opacity: 0.18,
            animation: reducedMotion
              ? undefined
              : `pondDrift ${line.driftSeconds}s ease-in-out ${line.driftDelaySeconds}s infinite alternate, pondBreathe ${line.breatheSeconds}s ease-in-out ${line.breatheDelaySeconds}s infinite alternate`,
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  )
}
