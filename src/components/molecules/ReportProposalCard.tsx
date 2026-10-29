'use client'

/**
 * ReportProposalCard (KAN-572) — the card a `file_report` call renders in the
 * composer thread: a drafted report about Pond itself, a one-line summary and
 * what the person described, both editable in place. Two controls: **file it**
 * and **cancel**. Nothing is filed until file it; filed, the card shows the
 * ticket's key as a link; cancelled, it folds to its eyebrow, so the turn it
 * came in never reads as an empty answer.
 *
 * No board draws this card — the ticket is an explicit user request. It is
 * built as `PageProposalCard`'s sibling, from the same parts and values: the
 * `.mn-proposal` pane (radius 14, padding 12px 13px, gap 10), the sans eyebrow
 * with its field count, 11px / 1.75 mono rows with the 52px label column, and
 * `PondControl kind="button"` — the first primary, the rest ghost.
 *
 * Purely presentational for the filing: the terminal owns the request, its
 * idempotency and the resolution; the card holds only the person's edits to
 * the draft until they press file it.
 */

import { useId, useState } from 'react'
import { PondControl } from '@/components/atoms/PondControl'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'
import { placeRowClass, placeLabelClass, placeFieldClass } from '@/components/molecules/place-row'
import { SUMMARY_MAX_CHARS } from '@/lib/feedback/build-issue'

export type ReportProposalStatus = 'proposed' | 'filing' | 'filed' | 'cancelled'

export interface ReportProposalCardProps {
  /** The drafted one-line summary. */
  summary: string
  /** The drafted description: what the person described. */
  text: string
  status: ReportProposalStatus
  filedKey?: string
  filedUrl?: string
  /** A failed filing's reason; the card stays open so file it can be pressed again. */
  error?: string
  onFile: (draft: { summary: string; text: string }) => void
  onCancel: () => void
  className?: string
}

const rowClass = cn(placeRowClass, 'px-2 py-0.5')

export function ReportProposalCard({
  summary,
  text,
  status,
  filedKey,
  filedUrl,
  error,
  onFile,
  onCancel,
  className,
}: ReportProposalCardProps) {
  const ids = useId()
  const [draftSummary, setDraftSummary] = useState(summary)
  const [draftText, setDraftText] = useState(text)

  if (status === 'cancelled') {
    return (
      <div
        role="group"
        aria-label="report — cancelled"
        data-part="report-proposal"
        data-status="cancelled"
        className={cn(
          'mn-proposal rounded-mn-inner px-[13px] py-3 font-mono lowercase tracking-[0.02em] opacity-70',
          className
        )}
      >
        <span className={pageEyebrowClass}>report — cancelled · nothing filed</span>
      </div>
    )
  }

  const filing = status === 'filing'
  const canFile = !filing && (draftSummary.trim() !== '' || draftText.trim() !== '')

  return (
    <div
      role="group"
      aria-label={`report — ${status === 'filed' ? 'filed' : 'proposed'}: ${draftSummary}`}
      data-part="report-proposal"
      data-status={status}
      className={cn(
        'mn-proposal flex flex-col gap-2.5 rounded-mn-inner px-[13px] py-3 font-mono lowercase tracking-[0.02em] text-foreground',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className={pageEyebrowClass}>
          {status === 'filed' ? 'report — filed' : 'report — proposed'}
        </span>
        {status !== 'filed' && <span className="text-[10.5px] text-mn-text-meta">2 fields</span>}
      </div>

      {status === 'filed' ? (
        <p aria-live="polite" className="px-2 text-[11px] leading-[1.75]">
          filed as{' '}
          <a href={filedUrl} target="_blank" rel="noreferrer" className="underline">
            {filedKey}
          </a>
        </p>
      ) : (
        <div className="text-[11px] leading-[1.75]">
          <div className={rowClass}>
            <label htmlFor={`${ids}-summary`} className={placeLabelClass}>
              summary
            </label>
            <input
              id={`${ids}-summary`}
              aria-label="summary"
              value={draftSummary}
              maxLength={SUMMARY_MAX_CHARS}
              disabled={filing}
              onChange={(e) => setDraftSummary(e.target.value)}
              className={placeFieldClass}
            />
          </div>
          <div className={rowClass}>
            <label htmlFor={`${ids}-text`} className={placeLabelClass}>
              described
            </label>
            <textarea
              id={`${ids}-text`}
              aria-label="described"
              rows={3}
              value={draftText}
              disabled={filing}
              onChange={(e) => setDraftText(e.target.value)}
              className={cn(placeFieldClass, 'resize-none leading-[1.75]')}
            />
          </div>
        </div>
      )}

      {error && status !== 'filed' && (
        <p role="alert" className="text-[10.5px] text-mn-text-meta">
          {error}
        </p>
      )}

      {status !== 'filed' && (
        <div className="flex flex-wrap gap-[7px] pt-0.5">
          <PondControl
            kind="button"
            variant="primary"
            label="file it"
            disabled={!canFile}
            onClick={() => {
              if (!canFile) return
              onFile({ summary: draftSummary.trim(), text: draftText.trim() })
            }}
          />
          <PondControl
            kind="button"
            variant="ghost"
            label="cancel"
            disabled={filing}
            onClick={onCancel}
          />
        </div>
      )}
    </div>
  )
}
