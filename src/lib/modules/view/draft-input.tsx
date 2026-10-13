'use client'

/**
 * A text input that commits once, not per keystroke: KAN-299. While focused it holds
 * its own draft and ignores incoming `value` changes, so a write that lands mid-typing
 * (the optimistic cache write/refetch this bug was built from) never resets what the
 * person is typing. The draft commits on blur or Enter, and only if it actually
 * changed `value` — no no-op write. Escape reverts to `value` without committing.
 */

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

export function DraftInput({
  value,
  onCommit,
  ...inputProps
}: {
  value: string
  onCommit: (value: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  // Read at blur time, not from the render closure: Escape's blur() fires the
  // onBlur handler synchronously, before React re-renders with the reverted draft.
  const draftRef = useRef(draft)
  const canceled = useRef(false)

  useEffect(() => {
    if (!focused.current) {
      setDraft(value)
      draftRef.current = value
    }
  }, [value])

  return (
    <input
      {...inputProps}
      value={draft}
      onChange={(e) => {
        draftRef.current = e.target.value
        setDraft(e.target.value)
      }}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        if (!canceled.current && draftRef.current !== value) onCommit(draftRef.current)
        canceled.current = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          canceled.current = true
          draftRef.current = value
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
