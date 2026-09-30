'use client'

/**
 * A relation property's value: the linked pages rendered as RelationChips, plus —
 * when `editable` — a bespoke title-search picker to add more (#20 slice 4).
 *
 * NOT absorbed into PondMolecule (#95, decision documented per the spec): the
 * molecule's `field-row` kind is one uppercase label + exactly ONE value atom —
 * a bad fit for a relation value, which is a *list* of chips plus a functional
 * search picker (state, refs, a menu). That puts this with the functional
 * molecules (CommandPalette, SlashMenu), out of PondMolecule's presentational
 * scope; it stays a thin delegator composing PondAtom through RelationChip.
 * Its visual coverage lives in RelationValueField.stories (the organism host).
 *
 * Presentational: the value (`string[]` of page-ids), the id→title map, and the
 * pickable `candidates` are all injected; a connected wrapper (slice 6) does the
 * fetching. Edits go out through `onChange` as a fresh `string[]` (addLink /
 * removeLink). An id with no title renders as a faded "missing" chip. `single`
 * makes the picker replace-on-select (radio); the read never clamps.
 *
 * The picker is built from raw primitives (useState/refs/role), mirroring
 * SlashMenu — not a shadcn wrapper.
 */

import { useEffect, useRef, useState } from 'react'
import { RelationChip } from '@/components/atoms/RelationChip'
import { addLink, removeLink } from '@/lib/modules/view/relation-value-ops'
import { cn } from '@/lib/utils'

export interface RelationCandidate {
  id: string
  title: string
}

export interface RelationValueProps {
  /** The linked page-ids. */
  value: string[]
  /** id→title for the linked ids (partial; a missing id renders faded). */
  titles: Map<string, string>
  /** The pages the picker offers (target collection rows, or global). */
  candidates: RelationCandidate[]
  /** Radio cap — the picker replaces-on-select instead of appending. */
  single?: boolean
  /** Read-only hosts pass false: chips render, but no × and no picker. */
  editable?: boolean
  /** Emit the next value after an add/remove. */
  onChange: (next: string[]) => void
  /** Open a linked page (chip click). */
  onOpen: (id: string) => void
  className?: string
}

export function RelationValue({
  value,
  titles,
  candidates,
  single = false,
  editable = false,
  onChange,
  onOpen,
  className,
}: RelationValueProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setFilter('')
  }

  function select(id: string) {
    onChange(addLink(value, id, single))
    close()
  }

  // Don't offer an already-linked page; then title-filter the rest.
  const linked = new Set(value)
  const q = filter.trim().toLowerCase()
  const options = candidates
    .filter((c) => !linked.has(c.id))
    .filter((c) => !q || c.title.toLowerCase().includes(q))

  return (
    <span className={cn('relative inline-flex flex-wrap items-center gap-1', className)}>
      {value.map((id) => (
        <RelationChip
          key={id}
          id={id}
          title={titles.get(id)}
          missing={!titles.has(id)}
          onOpen={onOpen}
          onRemove={editable ? () => onChange(removeLink(value, id)) : undefined}
        />
      ))}

      {editable && (
        <button
          type="button"
          aria-label="Link a page"
          onClick={() => (open ? close() : setOpen(true))}
          className="rounded-mn-pill border border-dashed border-mn-line px-2 py-0.5 font-mono lowercase tracking-[0.1em] text-xs text-mn-text-secondary transition-colors hover:border-mn-text/50 hover:text-mn-text-meta"
        >
          + link
        </button>
      )}

      {editable && open && (
        <div
          role="menu"
          aria-label="Page picker"
          className="motion-menu absolute left-0 top-full z-[100] mt-1 w-64 overflow-hidden rounded-mn-inner bg-mn-surface shadow-mn-lg"
        >
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
            placeholder="search pages…"
            aria-label="Search pages to link"
            className="w-full border-b border-mn-hair bg-transparent px-3 py-2 font-mono lowercase tracking-[0.1em] text-sm outline-none placeholder:text-mn-text-faint"
          />
          <div className="max-h-64 overflow-y-auto p-1">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm italic text-mn-text-secondary">No pages match</p>
            ) : (
              options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  onClick={() => select(c.id)}
                  className="block w-full truncate rounded-mn-row px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-mn-wash focus-visible:bg-mn-wash"
                >
                  {c.title}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  )
}
