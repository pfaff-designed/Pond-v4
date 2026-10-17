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
 * the component library rather than a frame: `.mn-glass` at the shell's shared
 * `PLACEMENT` (`Pond 05 Shell`'s top-20, centred spot), `ComposerLine`'s own
 * `ComposerSend` for send, and `PondAtom kind="tag"` for the page chip.
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { PondAtom } from '@/components/atoms/PondAtom'
import { ComposerSend } from '@/components/molecules/ComposerLine'
import { PLACEMENT } from '@/lib/layout/shell-placement'

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

  const lineRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Opened via ⌘K → ↵, which leaves focus on the palette's now-unmounted row —
  // move it onto the line so typing lands immediately, and again once a
  // `sending` round-trip returns to `idle` for a second report. `filed`/`error`
  // unmount the line, so focus moves onto the dialog itself rather than
  // falling to the body — `filed`'s link stays reachable by Tab but is never
  // auto-focused, so a second ↵ to "send again" can't activate it.
  useEffect(() => {
    if (status === 'idle') lineRef.current?.focus()
    else if (status === 'filed' || status === 'error') dialogRef.current?.focus()
  }, [status])

  // Esc closes the box in every status. `sending`/`filed`/`error` move focus
  // off the line, so a keydown listener scoped to the dialog's own subtree
  // (e.g. a React `onKeyDown` on this div) never sees it — a document
  // listener for the box's mounted lifetime does.
  useEffect(() => {
    function handleEscape(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const submit = () => {
    if (!canSend) return
    onSubmit(text.trim())
  }

  const handleLineKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="report a problem"
      tabIndex={-1}
      className={cn(
        PLACEMENT,
        'mn-glass z-[100] flex w-[360px] flex-col gap-2.5 rounded-[20px] p-3 font-mono text-[13px] lowercase tracking-[0.02em] text-mn-text md:w-[420px] focus:outline-none'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-mn-text-secondary">report a problem</span>
        {pageTitle !== '' && <PondAtom kind="tag" value={pageTitle} className="min-w-0" />}
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
            ref={lineRef}
            rows={1}
            aria-label="what went wrong?"
            placeholder="what went wrong?"
            value={text}
            disabled={!ready}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleLineKeyDown}
            className="min-h-[20px] flex-1 resize-none border-0 bg-transparent p-0 text-[16px] leading-[1.5] tracking-[0.02em] outline-none placeholder:text-mn-text-secondary disabled:opacity-60 md:text-[14px]"
          />
          <ComposerSend ariaLabel="send" on={canSend} onClick={submit} />
        </div>
      )}
    </div>
  )
}
