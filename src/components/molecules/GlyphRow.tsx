'use client'

/**
 * The curated glyph row — `Pond 06.13` `s6m2`'s six glyphs, in the board's order.
 * Shared by the new-pond sheet and the pond switcher's rename editor (KAN-492):
 * both pick from the same six, not the full 182-glyph library
 * (`PondPicker kind="glyph"`, `GlyphPicker.tsx`).
 */

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from '@/components/atoms/Icon'
import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'

/** The first is the column default. */
export const GLYPHS = ['lightning-03', 'waves-02', 'star-01', 'house', 'ring', 'heart'] as const

/** A glyph's accessible name: its library id without the glyph library's `-NN` suffix. */
export const glyphLabel = (glyph: string) => glyph.replace(/-\d+$/, '')

export const GLYPH_CELL = `flex h-[34px] w-[34px] items-center justify-center rounded-[10px] ${FOCUS_VISIBLE_RING}`
export const GLYPH_SELECTED = 'bg-mn-text/[0.05] shadow-[inset_0_0_0_2px_var(--mn-text)]'
export const GLYPH_UNSELECTED = 'bg-mn-text/[0.04]'

/** `s6m2`'s glyph row: a real radiogroup, roving tabindex, clamped (no wrap) ←/→. */
export function GlyphRow({ value, onChange }: { value: string; onChange: (glyph: string) => void }) {
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (index: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const target = index + (e.key === 'ArrowRight' ? 1 : -1)
    if (target < 0 || target >= GLYPHS.length) return
    e.preventDefault()
    onChange(GLYPHS[target])
    cellRefs.current[target]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="glyph" className="flex flex-wrap gap-[6px]">
      {GLYPHS.map((g, i) => (
        <button
          key={g}
          type="button"
          ref={(el) => {
            cellRefs.current[i] = el
          }}
          role="radio"
          aria-checked={g === value}
          aria-label={glyphLabel(g)}
          tabIndex={g === value ? 0 : -1}
          onClick={() => onChange(g)}
          onKeyDown={handleKeyDown(i)}
          className={`${GLYPH_CELL} ${g === value ? GLYPH_SELECTED : GLYPH_UNSELECTED}`}
        >
          <Icon name={g} size={15} />
        </button>
      ))}
    </div>
  )
}
