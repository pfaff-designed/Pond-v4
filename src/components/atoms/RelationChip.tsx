'use client'

/**
 * One relation link rendered as a chip (#20). A present link shows the target
 * page's title and is clickable → `onOpen(id)` opens it. A `missing` link — an
 * id that resolves to no page (deleted or off-target, tolerated per #20
 * leniency) — renders faded and inert; the user drops it via the picker's ×.
 * Mirrors QuoteChip / CsvAttachmentPill (Press language).
 */

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
  /** The id resolved to no page — render faded and inert. */
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
  // A container span (never a button) holds the label + an optional ×, so the two
  // interactive elements never nest (invalid HTML). QuoteChip / CsvAttachmentPill
  // follow the same shape.
  const base =
    'inline-flex items-center gap-1 rounded-mn-pill px-2.5 py-0.5 font-mono lowercase tracking-[0.1em] text-xs max-w-[24ch]'

  const removeButton = onRemove ? (
    <button
      type="button"
      aria-label={missing ? 'Remove missing link' : `Remove ${title ?? id}`}
      onClick={onRemove}
      className="flex-shrink-0 text-press-faint transition-colors hover:text-press-body"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  ) : null

  if (missing) {
    return (
      <span
        title="This linked page no longer exists"
        className={cn(
          base,
          'italic text-press-faint shadow-[inset_0_0_0_1px_var(--press-line)]',
          className
        )}
      >
        <span className="truncate">Missing page</span>
        {removeButton}
      </span>
    )
  }

  return (
    <span className={cn(base, 'bg-press-accent-wash text-press-body', className)}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        title={title}
        className="truncate text-left outline-none transition-colors hover:underline"
      >
        {title ?? id}
      </button>
      {removeButton}
    </span>
  )
}
