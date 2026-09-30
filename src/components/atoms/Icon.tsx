'use client'

/**
 * A Make Noise glyph (#91) — one of the 182 solid silhouettes in
 * `public/icons/`, masked over `currentColor` so it inherits colour exactly
 * like text. Colour it with `color`, never `fill`. Ported from the handoff's
 * `_ds/mn/assets/icons/icon-mask.js` + `components/icon/Icon.jsx`.
 *
 * Two rules worth carrying (readme §1). `mask-image` cannot reference a file
 * URL from a sandboxed origin, so every glyph is fetched ONCE per name through
 * a module-level cache and applied as a data-URI mask — a glyph rendering as a
 * solid square means the mask failed. And the fetch runs in an effect, so the
 * server renders an empty sized `<span>` with NO background: a bare
 * `currentColor` square never flashes before the mask lands. A missing glyph
 * warns and stays unpainted; it never throws.
 *
 * Marks, not content: `aria-hidden` by default. Pass `aria-hidden={false}`
 * only when the caller labels the glyph itself.
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface IconProps {
  /** Glyph file name under `/icons/` (without `.png`), e.g. `star-01`. */
  name: string
  /** Square size in px. @default 13 */
  size?: number
  className?: string
  'aria-hidden'?: boolean
}

/** One in-flight/settled load per glyph name — shared by every mount. */
const cache = new Map<string, Promise<string | null>>()

/** Blob → data-URI (FileReader, so it works in jsdom as well as the browser). */
function toDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Resolve a glyph to its data-URI, fetching `/icons/<name>.png` at most once
 * per name. Resolves `null` (after a `console.warn`) when the glyph is
 * missing; never rejects.
 */
export function loadIcon(name: string): Promise<string | null> {
  // No fetch (a server / non-browser render) — nothing to paint, nothing to cache.
  if (typeof fetch !== 'function') return Promise.resolve(null)
  let pending = cache.get(name)
  if (!pending) {
    pending = fetch(`/icons/${name}.png`)
      .then((res) => {
        if (!res.ok) throw new Error(`icon missing: /icons/${name}.png`)
        return res.blob()
      })
      .then(toDataUri)
      .catch((err) => {
        console.warn(err)
        return null
      })
    cache.set(name, pending)
  }
  return pending
}

export function Icon({ name, size = 13, className, 'aria-hidden': ariaHidden = true }: IconProps) {
  const [uri, setUri] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadIcon(name).then((u) => {
      if (live) setUri(u)
    })
    return () => {
      live = false
    }
  }, [name])

  const mask = uri ? `url("${uri}") no-repeat center / contain` : undefined
  return (
    <span
      data-icon={name}
      aria-hidden={ariaHidden ? 'true' : undefined}
      className={cn('inline-block flex-shrink-0', className)}
      style={{
        width: size,
        height: size,
        // Only once the data-URI is in hand — until then no ground at all.
        ...(mask ? { background: 'currentColor', WebkitMask: mask, mask } : {}),
      }}
    />
  )
}
