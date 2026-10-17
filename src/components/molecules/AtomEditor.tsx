'use client'

/**
 * AtomEditor (KAN-350) — the click-to-edit host shared by the properties card's
 * text, number and date values: a `PondAtom` at rest/empty/error, a real
 * `<input>` while editing. The atom itself stays pure (#93, no handlers); this is
 * the interactive wrapper the board's `editing` state needs. select/status use
 * their own host (`TagValueEditor`) — picking from a fixed list isn't text that
 * parses to a value, so it doesn't fit this host's parse/commit loop.
 *
 * Click or Enter/Space on the atom (a native `<button>`, so both activate it for
 * free) opens the input, seeded with `editValue` (falling back to the display
 * `value`). From there: Enter or blur calls `parse` on the draft — `'empty'`
 * commits `null`, a value commits it, and `null` means the text names nothing
 * this field can hold. On Enter that keeps the draft open with the field's error
 * note showing (`not a number`, by default); on blur it reverts silently with
 * nothing written, mirroring `DraftInput`'s badInput discipline. Esc always
 * reverts without committing, from either state.
 *
 * `preview` is optional: while editing (not in error), it maps the live draft to
 * a mono line shown under the input — the date editor's resolved-day readout
 * (`tomorrow` → `19 sep`), nothing for text/number, which pass none.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PondAtom, type PondAtomKind } from '@/components/atoms/PondAtom'
import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'

type Mode = 'rest' | 'editing' | 'error'

export interface AtomEditorProps {
  /** The atom kind this value renders as at rest/empty/error. */
  kind: PondAtomKind
  /** The formatted display text at rest (e.g. `propertyAtom`'s `value`). */
  value?: string
  empty?: boolean
  /** Seeds the input when editing starts. Falls back to `value`. */
  editValue?: string
  /** @default true — false renders the atom with no click target. */
  editable?: boolean
  size?: 'desktop' | 'mobile'
  className?: string
  'aria-label'?: string
  /**
   * The committed text → a value to write, `'empty'` to clear to `null`, or
   * `null` when the text parses to nothing this field can hold.
   */
  parse: (text: string) => string | number | null | 'empty'
  onCommit: (value: string | number | null) => void
  /** The note shown while a bad draft stays open. @default 'not a number' */
  errorNote?: string
  /** Live draft → the mono preview line under the input. Omit for no preview line. */
  preview?: (text: string) => string | null
}

export function AtomEditor({
  kind,
  value,
  empty = false,
  editValue,
  editable = true,
  size = 'desktop',
  className,
  parse,
  onCommit,
  errorNote = 'not a number',
  preview,
  'aria-label': ariaLabel,
}: AtomEditorProps) {
  const [mode, setMode] = useState<Mode>('rest')
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // The draft's starting text — settling back to the untouched seed is not an
  // edit, so it skips `parse`/`onCommit` entirely rather than risking a no-op
  // write (or a false error, were the seed itself ever unparseable).
  const seedRef = useRef('')
  // Set only by a key-driven end (↵/Esc), never by blur: a blur already has
  // its own next focus target (the next field on Tab, wherever a click
  // landed), and stealing it back would fight the browser, not fix it.
  const refocusOnRestRef = useRef(false)

  useEffect(() => {
    if (mode === 'rest' && refocusOnRestRef.current) {
      refocusOnRestRef.current = false
      triggerRef.current?.focus()
    }
  }, [mode])

  const startEditing = () => {
    if (!editable) return
    const seed = editValue ?? value ?? ''
    seedRef.current = seed
    setDraft(seed)
    setMode('editing')
  }

  const settle = (onInvalid: 'keep' | 'revert', refocus: boolean) => {
    if (draft === seedRef.current) {
      if (refocus) refocusOnRestRef.current = true
      setMode('rest')
      return
    }
    const parsed = parse(draft)
    if (parsed === null) {
      setMode(onInvalid === 'keep' ? 'error' : 'rest')
      return
    }
    if (refocus) refocusOnRestRef.current = true
    setMode('rest')
    onCommit(parsed === 'empty' ? null : parsed)
  }

  if (mode === 'rest') {
    const atom = <PondAtom kind={kind} value={value} state={empty ? 'empty' : 'rest'} size={size} />
    if (!editable) return <span className={className}>{atom}</span>
    return (
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={startEditing}
        // A host row (the table's last-cell step-out, KAN-344) reads keydowns
        // off this same element's ancestor — stop here so Enter/↓ open the
        // editor instead of being read as "leave the row".
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          'min-w-0 max-w-full rounded-mn-chrome border-0 bg-transparent p-0 text-left',
          FOCUS_VISIBLE_RING,
          className
        )}
      >
        {atom}
      </button>
    )
  }

  const numeric = kind === 'number' || kind === 'money' || kind === 'percent' || kind === 'duration'
  const previewText = mode === 'editing' && preview ? preview(draft) : null

  return (
    <span className={cn('inline-flex min-w-0 max-w-full flex-col items-start gap-1', className)}>
      <input
        ref={inputRef}
        autoFocus
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setMode('editing')
        }}
        onBlur={() => settle('revert', false)}
        onKeyDown={(e) => {
          // Same ancestor-listener reason as the trigger button above —
          // typing/Enter/Esc here is this editor's own business, not the row's.
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            settle('keep', true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            refocusOnRestRef.current = true
            setMode('rest')
          }
        }}
        className={cn(
          'box-border min-w-0 max-w-full rounded-mn-chrome px-1.5 text-mn-text ring-[1.4px] ring-inset ring-mn-text outline-none tabular-nums',
          size === 'mobile' ? 'min-h-11 text-[15px]' : 'min-h-[26px] text-[13.5px]',
          numeric && 'font-medium'
        )}
      />
      {mode === 'error' && (
        <span
          data-part="note"
          className="whitespace-nowrap font-mono lowercase text-[10.5px] text-mn-text-secondary"
        >
          {errorNote}
        </span>
      )}
      {previewText !== null && (
        <span
          data-part="preview"
          className="whitespace-nowrap font-mono lowercase text-[10.5px] text-mn-text-secondary"
        >
          {previewText}
        </span>
      )}
    </span>
  )
}
