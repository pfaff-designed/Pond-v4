'use client'

/**
 * Commit-on-settle text input. The draft only diverges from an incoming `value`
 * once the person types (`dirty`); until then it keeps tracking `value` even
 * while focused, so a write that lands before any keystroke isn't reverted by a
 * stale commit on blur. Once dirty, the draft holds against incoming `value`
 * changes and commits on blur or Enter, only if it actually changed `value` —
 * no no-op write. Escape reverts to `value` without committing.
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
  // Read at blur time, not from the render closure: Escape's blur() fires the
  // onBlur handler synchronously, before React re-renders with the reverted draft.
  const draftRef = useRef(draft)
  const canceled = useRef(false)
  // Set only by onChange, cleared on blur/Enter/Escape. An untouched draft keeps
  // tracking an incoming `value` even while focused, so a write that lands before
  // the person has typed anything (KAN-290: the placement reply patching the name
  // while the field is merely focused) isn't reverted by a stale-draft commit.
  const dirty = useRef(false)
  // Latest value/onCommit for the unmount commit below, which runs outside any
  // render and can't close over render-time props.
  const valueRef = useRef(value)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    valueRef.current = value
    onCommitRef.current = onCommit
  })

  useEffect(() => {
    if (!dirty.current) {
      setDraft(value)
      draftRef.current = value
    }
  }, [value])

  // React fires no blur for a focused input that unmounts (keyboard navigation
  // away, the row removed by a refetch): commit the draft here so it isn't lost.
  useEffect(() => {
    return () => {
      if (dirty.current && !canceled.current && draftRef.current !== valueRef.current) {
        onCommitRef.current(draftRef.current)
      }
    }
  }, [])

  return (
    <input
      {...inputProps}
      value={draft}
      onChange={(e) => {
        dirty.current = true
        draftRef.current = e.target.value
        setDraft(e.target.value)
      }}
      onBlur={(e) => {
        // An incomplete segment (e.g. a cleared year in a date input) reports '' with
        // validity.badInput true: commit would overwrite the stored value with null.
        if (e.target.validity.badInput) {
          draftRef.current = value
          setDraft(value)
        } else if (dirty.current && !canceled.current && draftRef.current !== value) {
          onCommit(draftRef.current)
        }
        canceled.current = false
        dirty.current = false
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          canceled.current = true
          dirty.current = false
          draftRef.current = value
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
