'use client'

/**
 * TagValueEditor (KAN-350) — select/status's click-to-edit host: the value at
 * rest is a `tag` chip (`PondAtom`, from `propertyAtom`). Click or Enter opens
 * a popover in the `PondPicker` glass (`picker-chrome.ts`'s `GLASS`) with a
 * filter input and the field's options as `PondControl kind="menu"` rows —
 * the same mono chrome `SlashMenu`/`SourcePicker` use, with its own list
 * rather than theirs (those pickers' `slash-row.tsx` `Row` is a different
 * board row from this one).
 *
 * Typing filters by label; ↑↓ moves; ↵ picks; Esc closes with no change. A
 * `clear` row leads the list when a value is set, unfiltered by the query (an
 * action, not an option). When the query matches no option's label exactly and
 * the host passes `onAddOption`, the LAST row is `＋ new tag "<query>"` —
 * picking it hands the typed label back to the host, which owns the schema
 * write (there's no `_schema` to add an option to from inside this component).
 * Omitting `onAddOption` (e.g. a host with no schema to write) drops the row
 * entirely rather than rendering a dead affordance.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PondAtom } from '@/components/atoms/PondAtom'
import { PondControl } from '@/components/atoms/PondControl'
import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { cn } from '@/lib/utils'
import type { PropertyOption } from '@/lib/properties/schema'
import { GLASS, LIST } from './picker-chrome'
import { useAnchoredBox, type PickerAnchor } from './use-anchored-box'

export interface TagValueEditorProps {
  /** The field's allowed choices. */
  options: readonly PropertyOption[]
  /** The stored option id, or null when unset. */
  value: string | null
  /** The current option's label — `propertyAtom`'s already-resolved display text. */
  label?: string
  empty: boolean
  /** @default true */
  editable?: boolean
  'aria-label'?: string
  className?: string
  onChange: (next: string | null) => void
  /** The host turns a picked label into a schema write (new option) + the
   *  value set. Omit where the host can't write the schema — the "+ new tag"
   *  row then never appears. */
  onAddOption?: (label: string) => void
}

/** Neither id is a real option (minted ids never collide with these). */
const CLEAR_ID = '__clear__'
const NEW_ID = '__new__'
const WIDTH_PX = 220

interface TagRow {
  id: string
  label: string
  clear?: boolean
  isNew?: boolean
}

export function TagValueEditor({
  options,
  value,
  label,
  empty,
  editable = true,
  className,
  onChange,
  onAddOption,
  'aria-label': ariaLabel,
}: TagValueEditorProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // `refocus` is false only for a dismiss caused by clicking some other
  // focusable element (the browser already moved focus there) — forcing it
  // back to this trigger would fight that, same as AtomEditor's blur rule.
  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function pick(next: string | null) {
    onChange(next)
    close(true)
  }

  function create(newLabel: string) {
    onAddOption?.(newLabel)
    close(true)
  }

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => editable && setOpen(true)}
        // A host row (the table's last-cell step-out, KAN-344) reads keydowns
        // off this same element's ancestor — stop here so Enter opens the
        // popover instead of being read as "leave the row".
        onKeyDown={(e) => e.stopPropagation()}
        disabled={!editable}
        className={cn(
          'rounded-mn-chrome border-0 bg-transparent p-0 text-left',
          FOCUS_VISIBLE_RING
        )}
      >
        <PondAtom kind="tag" value={label} state={empty ? 'empty' : 'rest'} />
      </button>
      {open && (
        <TagPopover
          options={options}
          value={value}
          anchor={buttonRef}
          onPick={pick}
          onCreate={onAddOption ? create : undefined}
          onEscape={() => close(true)}
          onDismiss={() => close(false)}
        />
      )}
    </span>
  )
}

function TagPopover({
  options,
  value,
  anchor,
  onPick,
  onCreate,
  onEscape,
  onDismiss,
}: {
  options: readonly PropertyOption[]
  value: string | null
  anchor: PickerAnchor
  onPick: (next: string | null) => void
  onCreate?: (label: string) => void
  /** Esc, from inside the glass — refocuses the trigger. */
  onEscape: () => void
  /** A press outside the glass and its trigger — leaves focus where it fell. */
  onDismiss: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const glassRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmedQuery = query.trim()
  const q = trimmedQuery.toLowerCase()
  const matches = options.filter((o) => o.label.toLowerCase().includes(q))
  const hasExactMatch = options.some((o) => o.label.trim().toLowerCase() === q)
  const showNewRow = !!onCreate && trimmedQuery !== '' && !hasExactMatch
  const rows: TagRow[] = [
    ...(value !== null ? [{ id: CLEAR_ID, label: 'clear', clear: true }] : []),
    ...matches.map((o) => ({ id: o.id, label: o.label })),
    ...(showNewRow ? [{ id: NEW_ID, label: `＋ new tag "${trimmedQuery}"`, isNew: true }] : []),
  ]
  const clamped = Math.min(active, Math.max(0, rows.length - 1))

  function select(row: TagRow) {
    if (row.isNew) onCreate?.(trimmedQuery)
    else onPick(row.clear ? null : row.id)
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Only the filter input is focusable inside the glass (the rows are plain
  // `role="option"` divs), so ↑↓/↵/Esc only need to be read off ITS keydown —
  // a document-level listener would keep firing after Tab moved focus
  // elsewhere, since nothing here ever closed the popover on its own.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // `createPortal` keeps this in the REACT tree under the cell that opened
    // it, so an un-stopped keydown still bubbles to a host row's own listener
    // (the table's last-cell step-out, KAN-344) even though the DOM node sits
    // in `document.body`.
    e.stopPropagation()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
    } else if (e.key === 'Enter') {
      const row = rows[clamped]
      if (row) {
        e.preventDefault()
        select(row)
      }
    }
  }

  // Tab (or any focus move not landing back inside the glass) closes the
  // popover instead of leaving it open with a stale `active` row — the
  // dismiss path, not the Esc/pick path, since focus already left on its own.
  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null
    if (next && glassRef.current?.contains(next)) return
    onDismiss()
  }

  // A press outside the glass or its trigger closes it, Esc-style (no change).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (glassRef.current?.contains(target)) return
      const anchorEl = anchor && 'current' in anchor ? anchor.current : anchor
      if (
        anchorEl &&
        typeof (anchorEl as Partial<HTMLElement>).contains === 'function' &&
        (anchorEl as unknown as HTMLElement).contains(target)
      )
        return
      onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [anchor, onDismiss])

  const style = useAnchoredBox(anchor, 'bottom', WIDTH_PX)

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={glassRef}
      data-part="glass"
      data-kind="tag"
      className={GLASS}
      style={{ ...style, width: WIDTH_PX }}
      onMouseDown={(e) => e.preventDefault()}
      onBlur={handleBlur}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={handleKeyDown}
        placeholder="filter…"
        aria-label="filter options"
        className="mx-[2px] mb-[2px] rounded-mn-row border-b border-mn-text/[0.09] bg-transparent px-[8px] py-[6px] font-mono text-[12px] lowercase text-mn-text outline-none placeholder:text-mn-text-secondary"
      />
      <div role="listbox" aria-label="options" className={LIST}>
        {rows.length === 0 ? (
          <div className="px-[10px] py-[8px] font-mono text-[12px] lowercase text-mn-text-secondary">
            no options
          </div>
        ) : (
          rows.map((row, i) => (
            <PondControl
              key={row.id}
              kind="menu"
              role="option"
              aria-selected={i === clamped}
              state={i === clamped ? 'selected' : 'rest'}
              label={row.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(row)}
            />
          ))
        )}
      </div>
    </div>,
    document.body
  )
}
