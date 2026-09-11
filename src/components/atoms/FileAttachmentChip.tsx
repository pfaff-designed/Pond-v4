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
        'inline-flex items-center gap-1.5 rounded border border-press-line bg-press-accent-wash',
        'px-2 py-0.5 font-mono text-xs text-press-body max-w-[28ch]',
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
          className="h-5 w-5 flex-shrink-0 rounded-[2px] border border-press-line object-cover"
        />
      ) : (
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
      )}
      <span className="truncate" title={filename}>
        {filename}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${filename}`}
          onClick={onRemove}
          className="flex-shrink-0 text-press-faint hover:text-press-body transition-colors ml-0.5"
        >
          ×
        </button>
      )}
    </span>
  )
}
