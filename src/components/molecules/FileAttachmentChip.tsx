'use client'

/**
 * Attachment chip for an uploaded file (#61) — the generalized sibling of
 * CsvAttachmentPill. Images get a small thumbnail; other files get the
 * paperclip glyph. With `onRemove` it's the composer's remove-before-send
 * affordance; without it, it renders inert (a sent message's attachment).
 */

import { cn } from '@/lib/utils'
import { isImageMediaType } from '@/lib/attachments/validate'

export interface FileAttachmentChipProps {
  filename: string
  url: string
  mediaType: string
  onRemove?: () => void
  className?: string
}

export function FileAttachmentChip({
  filename,
  url,
  mediaType,
  onRemove,
  className,
}: FileAttachmentChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-mn-pill bg-mn-wash',
        'px-2.5 py-0.5 font-mono lowercase tracking-[0.1em] text-xs text-mn-text-meta max-w-[28ch]',
        className
      )}
    >
      {isImageMediaType(mediaType) ? (
        // A tiny thumbnail of user-uploaded storage content; next/image's
        // required sizing buys nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          aria-hidden
          className="h-5 w-5 flex-shrink-0 rounded-mn-hair object-cover shadow-mn-sm"
        />
      ) : (
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
      )}
      <span className="truncate" title={filename}>
        {filename}
      </span>
      {onRemove && (
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
      )}
    </span>
  )
}
