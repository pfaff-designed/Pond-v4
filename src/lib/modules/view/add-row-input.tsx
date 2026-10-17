'use client'

/**
 * Inline input shared by list, calendar and timeline for adding a new row.
 * Always starts blank — it never edits an existing value — and never commits
 * until Enter or blur carries non-empty text; Escape (or an empty blur) closes
 * without writing. `staysOpen` decides what a commit does next: clear and keep
 * focus so another item can follow (list, timeline), or hand off to `onCancel`
 * so the host can close it (calendar — one record per click).
 */

import { useRef, useState, type InputHTMLAttributes } from 'react'

export function AddRowInput({
  onCommit,
  onCancel,
  staysOpen,
  ...inputProps
}: {
  onCommit: (title: string) => void
  onCancel: () => void
  staysOpen: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>) {
  const [draft, setDraft] = useState('')
  // Only the closing paths (Escape, and Enter when !staysOpen) blur the input
  // themselves; this guards the native blur that follows from re-running the
  // commit/cancel it already did. A staysOpen Enter never sets this, so a
  // later real blur still commits whatever the person typed since.
  const settled = useRef(false)

  const commit = (title: string) => {
    onCommit(title)
    if (staysOpen) {
      setDraft('')
    } else {
      onCancel()
    }
  }

  return (
    <input
      {...inputProps}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (settled.current) {
          settled.current = false
          return
        }
        const title = draft.trim()
        if (title) {
          commit(title)
        } else {
          onCancel()
        }
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          const title = draft.trim()
          if (!title) return
          commit(title)
          if (!staysOpen) {
            settled.current = true
            e.currentTarget.blur()
          }
        } else if (e.key === 'Escape') {
          setDraft('')
          onCancel()
          settled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}
