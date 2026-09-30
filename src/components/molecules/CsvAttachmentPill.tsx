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
        'inline-flex items-center gap-1.5 rounded-mn-pill bg-mn-wash',
        'px-2.5 py-0.5 font-mono lowercase tracking-wider text-xs text-mn-text-meta max-w-[20ch] truncate',
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
        className="flex-shrink-0 text-mn-text-secondary"
      >
        <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3Z" />
      </svg>
      <span className="truncate" title={filename}>
        {filename}
      </span>
      <span className="text-mn-text-faint flex-shrink-0">
        ·{rowCount} {noun}
      </span>
      <button
        type="button"
        aria-label={`Remove ${filename}`}
        onClick={onRemove}
        className="flex-shrink-0 text-mn-text-faint hover:text-mn-text-meta transition-colors ml-0.5"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  )
}
