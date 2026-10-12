'use client'

/** Preview attachment pill for an uploaded HTML file (KAN-251), following board `sRef` (PondComposer.dc.html). */

import { cn } from '@/lib/utils'

export interface HtmlAttachmentPillProps {
  filename: string
  onRemove: () => void
  className?: string
}

const BYTES_PER_MB = 1024 * 1024
/** Tolerance for a non-integer byte count that is a tenth of a MB only up to
 *  float noise (21.4 * BYTES_PER_MB); a real file is at least ~9.5e-6 of a
 *  tenth over, so this never swallows a genuine overshoot. */
const TENTH_NOISE = 1e-6

const formatMegabytes = (bytes: number): string => {
  const tenths = Math.ceil((bytes * 10) / BYTES_PER_MB - TENTH_NOISE)
  if (tenths % 10 === 0) return `${tenths / 10}`
  return (tenths / 10).toFixed(1)
}

/** `b`/`kb`/`mb`, a space before the unit (06.25 frame 2: "214 kb") — reused by
 *  the composer's reading row so both places agree on one size format. Pass
 *  `'upper'` where the board uppercases the unit in running prose instead
 *  (06.25 frame 6's too-large copy: "64 MB", "up to 20 MB"). The mb branch is
 *  ruled by the conductor (Jira KAN-251 comment 10091, 11 oct 2026): one
 *  decimal, rounded UP to the next tenth, with a whole number printed without
 *  ".0" — so a 21.40 MB file reads "21.4 MB", a 20.03 MB file "20.1 MB" (never
 *  "20.0", never "21"), and the 20 MB limit stays "20 MB". */
export function formatBytes(bytes: number, unitCase: 'lower' | 'upper' = 'lower'): string {
  const value =
    bytes < 1024
      ? `${bytes}`
      : bytes < BYTES_PER_MB
        ? `${Math.round(bytes / 1024)}`
        : formatMegabytes(bytes)
  const unit = bytes < 1024 ? 'b' : bytes < BYTES_PER_MB ? 'kb' : 'mb'
  return `${value} ${unitCase === 'upper' ? unit.toUpperCase() : unit}`
}

export function HtmlAttachmentPill({
  filename,
  onRemove,
  className,
}: HtmlAttachmentPillProps) {
  return (
    <span
      className={cn(
        // no 'truncate' here: it would clip the remove button's max-md:before
        // hit area to the pill's box, shrinking the 44px mobile target.
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-mn-pill bg-mn-text/[0.07]',
        // leading-normal: board sRef is 23px tall; without it the pill inherits
        // preflight's html line-height and measures 26.5px (11px × 1.5).
        'px-[10px] py-[5px] font-mono lowercase text-[11px] leading-normal text-mn-text',
        className
      )}
    >
      {/* paperclip icon */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="currentColor"
        width={11}
        height={11}
        className="flex-shrink-0"
      >
        <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 0 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3Z" />
      </svg>
      <span className="truncate" title={filename}>
        {filename}
      </span>
      <button
        type="button"
        aria-label={`Remove ${filename}`}
        onClick={onRemove}
        className={cn(
          'relative flex flex-shrink-0 items-center justify-center text-mn-text-secondary hover:text-mn-text-meta transition-colors ml-0.5',
          // 44px hit target (frame 7 / AUDIT X1) without growing the pill itself — the pseudo-element
          // extends past the button's own 10px box instead of the box growing into the layout.
          "max-md:before:absolute max-md:before:-inset-[17px] max-md:before:content-['']"
        )}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 3l6 6M9 3l-6 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  )
}
