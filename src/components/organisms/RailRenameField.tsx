'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface RailRenameFieldProps {
  title: string
  /** ↵ or blur. `refocus` is false for blur: the person has already moved on, and
   *  pulling focus back to the row would fight the click that caused it. */
  onKeep: (value: string, refocus: boolean) => void
  onCancel: () => void
}

/**
 * `PondRail` `renaming` — the row's label as a field in place (`field`: padding
 * 1px 6px, margin -2px 0, radius 6, inset ring a(.2), the white ground; ink on
 * ink). ↵ keeps, esc cancels, blur keeps.
 *
 * It settles exactly once: ↵ and esc unmount the field while it holds focus, and
 * that unmount can raise a blur that would otherwise keep a second time.
 */
export function RailRenameField({ title, onKeep, onCancel }: RailRenameFieldProps) {
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const settle = (finish: () => void) => {
    if (settled.current) return
    settled.current = true
    finish()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      settle(() => onKeep(draft, true))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      settle(onCancel)
    }
  }

  return (
    <input
      ref={inputRef}
      data-part="rename-field"
      type="text"
      aria-label={`rename ${title}`}
      value={draft}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => settle(() => onKeep(draft, false))}
      // The row opens its page on click: a click inside the field is editing.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="-my-[2px] min-w-0 flex-1 rounded-[6px] bg-mn-rail-field px-[6px] py-px font-normal text-mn-text caret-mn-text outline-none [box-shadow:inset_0_0_0_1px_var(--mn-rail-field-ring)]"
    />
  )
}
