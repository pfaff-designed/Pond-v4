'use client'

/**
 * One relation link rendered as a chip (#20). A present link shows the target
 * page's title and is clickable → `onOpen(id)` opens it. A `missing` link — an
 * id that resolves to no page (deleted or off-target, tolerated per #20
 * leniency) — renders struck-through and inert; the user drops it via the
 * picker's ×. The label itself is a `<PondAtom kind="relation">` (#93), so the
 * chip inherits the Make Noise machine-surface register; this wrapper only owns
 * the interaction (open / remove) around it.
 */

import { PondAtom } from '@/components/atoms/PondAtom'
import { cn } from '@/lib/utils'

export interface RelationChipProps {
  /** The linked page id (emitted to onOpen; shown as a fallback label). */
  id: string
  /** The linked page's title; omitted when it can't be resolved. */
  title?: string
  /** Open the linked page. Not called for a missing chip. */
  onOpen: (id: string) => void
  /** When set (editable host), render a × that unlinks this id. */
  onRemove?: () => void
  /** The id resolved to no page — render struck and inert. */
  missing?: boolean
  className?: string
}

export function RelationChip({
  id,
  title,
  onOpen,
  onRemove,
  missing = false,
  className,
}: RelationChipProps) {
  // A container span (never a button) holds the atom + an optional ×, so the two
  // interactive elements never nest (invalid HTML).
  const base = 'inline-flex max-w-[24ch] items-center gap-1'

  const removeButton = onRemove ? (
    <button
      type="button"
      aria-label={missing ? 'Remove missing link' : `Remove ${title ?? id}`}
      onClick={onRemove}
      className="flex-shrink-0 text-mn-mark-faint transition-colors hover:text-mn-text-meta"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  ) : null

  if (missing) {
    // note={false}: the atom's error fixture copy doesn't apply here — the chip's
    // own "Missing page" label carries the message.
    return (
      <span title="This linked page no longer exists" className={cn(base, className)}>
        <PondAtom kind="relation" state="error" note={false} value="Missing page" className="min-w-0" />
        {removeButton}
      </span>
    )
  }

  return (
    <span className={cn(base, className)}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        title={title}
        className="min-w-0 text-left outline-none transition-opacity hover:opacity-75"
      >
        <PondAtom kind="relation" value={title ?? id} />
      </button>
      {removeButton}
    </span>
  )
}
