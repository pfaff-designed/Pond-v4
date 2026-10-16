'use client'

/**
 * `report a problem`'s box (KAN-335) — opened by ⌘K's `report a problem` row.
 * Presentational: one line (`what went wrong?`), a read-only chip naming the
 * open page, and send. Esc closes it; ↵ (no shift) submits once and the line
 * goes inert until the caller flips `status` back to `idle` — so a held or
 * doubled ↵ mid-send files once (AUDIT G9), and the wiring owns the network
 * call and the status transitions.
 *
 * No board draws this box — the ticket is an explicit user request, built from
 * the component library rather than a frame: `.mn-glass` at `ShellCommands`'
 * own `PLACEMENT` (`Pond 05 Shell`'s top-20, centred spot), the line and send
 * sized off `ComposerLine`'s tokens (mono 16/14px line, 32px send circle).
 */

import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export type ReportProblemStatus = 'idle' | 'sending' | 'filed' | 'error'

export interface ReportProblemBoxProps {
  pageTitle: string
  status: ReportProblemStatus
  filedKey?: string
  filedUrl?: string
  errorText?: string
  onSubmit: (text: string) => void
  onClose: () => void
}

/** `ShellCommands`' `PLACEMENT`, verbatim — the shell's one centred-top spot. */
const PLACEMENT = 'absolute top-5 left-[calc(50%_+_13px)] w-max -translate-x-1/2'

export function ReportProblemBox({
  pageTitle,
  status,
  filedKey,
  filedUrl,
  errorText,
  onSubmit,
  onClose,
}: ReportProblemBoxProps) {
  const [text, setText] = useState('')
  const ready = status === 'idle'
  const canSend = ready && text.trim() !== ''

  const submit = () => {
    if (!canSend) return
    onSubmit(text.trim())
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const handleLineKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      role="dialog"
      aria-label="report a problem"
      className={cn(
        PLACEMENT,
        'mn-glass z-[100] flex w-[360px] flex-col gap-2.5 rounded-[20px] p-3 font-mono text-[13px] lowercase tracking-[0.02em] text-mn-text md:w-[420px]'
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-mn-text-secondary">report a problem</span>
        {pageTitle !== '' && (
          <span className="min-w-0 truncate rounded-full bg-mn-text/[0.07] px-2 py-0.5 text-[11px] text-mn-text-meta">
            {pageTitle}
          </span>
        )}
      </div>

      {status === 'filed' ? (
        <p className="text-[13px] text-mn-text">
          filed as{' '}
          <a href={filedUrl} target="_blank" rel="noreferrer" className="underline">
            {filedKey}
          </a>{' '}
          · thanks
        </p>
      ) : status === 'error' ? (
        <p role="alert" className="text-[13px] text-mn-text">
          {errorText}
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            aria-label="what went wrong?"
            placeholder="what went wrong?"
            value={text}
            disabled={!ready}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleLineKeyDown}
            className="min-h-[20px] flex-1 resize-none border-0 bg-transparent p-0 text-[16px] leading-[1.5] outline-none placeholder:text-mn-text-secondary disabled:opacity-60 md:text-[14px]"
          />
          <button
            type="button"
            aria-label="send"
            onClick={submit}
            disabled={!canSend}
            className={cn(
              'flex size-8 flex-none items-center justify-center rounded-mn-pill',
              canSend
                ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
                : 'bg-[rgba(27,29,20,0.12)] text-mn-text-meta dark:bg-[rgba(250,249,239,0.12)]'
            )}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M7 11V3" />
              <path d="M3.6 6.4 7 3l3.4 3.4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
