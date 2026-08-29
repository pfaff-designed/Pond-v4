'use client'

/** Preview attachment pill for an uploaded CSV (ticket-40 F16). */

import { cn } from '@/lib/utils'

export interface CsvAttachmentPillProps {
  filename: string
  rowCount: number
  onRemove: () => void
  className?: string
}

export function CsvAttachmentPill({
  filename,
  rowCount,
  onRemove,
  className,
}: CsvAttachmentPillProps) {
  const noun = rowCount === 1 ? 'row' : 'rows'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border border-press-line bg-press-accent-wash',
        'px-2 py-0.5 font-mono text-xs text-press-body max-w-[20ch] truncate',
        className
      )}
    >
      {/* paperclip icon */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="currentColor"
        width={10}
        height={10}
        className="flex-shrink-0 text-press-muted"
      >
        <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3Z" />
      </svg>
      <span className="truncate" title={filename}>
        {filename}
      </span>
      <span className="text-press-faint flex-shrink-0">
        ·{rowCount} {noun}
      </span>
      <button
        type="button"
        aria-label={`Remove ${filename}`}
        onClick={onRemove}
        className="flex-shrink-0 text-press-faint hover:text-press-body transition-colors ml-0.5"
      >
        ×
      </button>
    </span>
  )
}
