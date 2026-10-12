'use client'

/**
 * PlaceRow — the "under" row shared by every card that needs to place a page:
 * a label, a `<select>` listing the pond's name above `parentOptions`, and a
 * "change place" affordance that focuses the select and opens its picker.
 * Lifted out of `PageProposalCard` (6a frame 4) so no second place-picker gets
 * built (AGENTS.md "duplicates go").
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** A candidate parent (title-resolved and disambiguated upstream). */
export interface PlaceOption {
  id: string
  title: string
}

export interface PlaceRowHandle {
  /** Open the picker — the "change place" control calls this. */
  changePlace: () => void
}

/** KAN-267: the single source for the row's classes — every card that renders
 *  a `PlaceRow` reads these instead of pasting its own copy (AGENTS.md "a
 *  value written in a board is final", so two copies would only drift). */
export const placeRowClass = 'flex items-baseline gap-3'
export const placeLabelClass = 'w-[52px] flex-none text-[11px] text-mn-text-meta'
export const placeFieldClass =
  'min-w-0 flex-1 appearance-none border-0 border-b border-transparent bg-transparent p-0 font-mono text-[11px] lowercase tracking-[0.02em] text-foreground outline-none focus:border-mn-text/40'

export interface PlaceRowProps {
  id: string
  /** null = top level — the pond's root. */
  parentId: string | null
  parentOptions: PlaceOption[]
  /** The pond's name, shown as the top-level place. */
  pondName?: string
  /** KAN-267: false where the pond root names no page to write to (propose_changes
   *  has nowhere to put blocks at top level) — an unselected prompt option takes
   *  its place instead. Defaults true, so `PageProposalCard`'s `under` row, where
   *  the root legitimately means top level, is unchanged. */
  includeRootOption?: boolean
  onParentChange: (parentId: string | null) => void
  rowClassName?: string
  labelClassName?: string
  fieldClassName?: string
}

export const PlaceRow = forwardRef<PlaceRowHandle, PlaceRowProps>(function PlaceRow(
  {
    id,
    parentId,
    parentOptions,
    pondName = 'life',
    includeRootOption = true,
    onParentChange,
    rowClassName,
    labelClassName,
    fieldClassName,
  },
  ref
) {
  const underRef = useRef<HTMLSelectElement>(null)
  // "change place" opens the picker; until then the place reads as text, like
  // the frame ("creativity › kitchen renovation"). Both are the same <select>.
  const [placing, setPlacing] = useState(false)

  useImperativeHandle(ref, () => ({
    changePlace() {
      setPlacing(true)
      requestAnimationFrame(() => {
        const el = underRef.current
        if (!el) return
        el.focus()
        // Chromium ships showPicker(); elsewhere focus alone is the affordance.
        const withPicker = el as HTMLSelectElement & { showPicker?: () => void }
        try {
          withPicker.showPicker?.()
        } catch {
          /* a user gesture is required in some browsers — focus already landed */
        }
      })
    },
  }))

  return (
    <div className={rowClassName}>
      <label htmlFor={id} className={labelClassName}>
        under
      </label>
      <select
        ref={underRef}
        id={id}
        aria-label="under"
        value={parentId ?? ''}
        onChange={(e) => onParentChange(e.target.value || null)}
        onBlur={() => setPlacing(false)}
        className={cn(fieldClassName, 'cursor-pointer', placing && 'border-mn-text/40')}
      >
        {includeRootOption ? (
          <option value="">{pondName}</option>
        ) : (
          <option value="" disabled>
            choose a place
          </option>
        )}
        {parentOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </div>
  )
})
