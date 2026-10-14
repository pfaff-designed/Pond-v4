'use client'

/**
 * The composer's `refs` section (`PondComposer` DC) — one pill per live
 * `PageReference`, above the composer text (board `Pond 06.05`, frames 1-2:
 * "references sit above the text and can be removed"). Each item is
 * independently removable; there is no single-slot limit.
 */

import { AreaMark } from '@/components/atoms/AreaMark'
import { KindDot } from '@/components/atoms/PondAtom'
import { cn } from '@/lib/utils'

export interface ReferenceChip {
  key: string
  /** The referenced page's mark glyph, or null to draw the plain `KindDot`. */
  glyph: string | null
  /** The page's area accent. Undefined draws ink, same as an unaccented mark elsewhere. */
  accent?: string
  label: string
}

export interface ReferencesRowProps {
  items: ReferenceChip[]
  onRemove: (key: string) => void
  className?: string
}

export function ReferencesRow({ items, onRemove, className }: ReferencesRowProps) {
  if (items.length === 0) return null

  return (
    <div
      role="group"
      aria-label="references"
      className={cn('flex flex-wrap items-center gap-[7px]', className)}
    >
      {items.map((item) => (
        <span
          key={item.key}
          className="flex max-w-full items-center gap-1.5 rounded-mn-pill bg-mn-hover-fill px-[10px] py-[5px] font-mono text-[11px] lowercase tracking-[0.02em] text-mn-text"
        >
          {item.glyph ? (
            <AreaMark glyph={item.glyph} color={item.accent} size={11} />
          ) : (
            <KindDot accent={item.accent} className={!item.accent ? 'bg-mn-text/50' : undefined} />
          )}
          <span className="min-w-0 truncate">{item.label}</span>
          <button
            type="button"
            aria-label={`remove reference: ${item.label}`}
            onClick={() => onRemove(item.key)}
            className="flex-shrink-0 text-mn-text-secondary transition-colors hover:text-mn-text"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  )
}
