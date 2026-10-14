'use client'

/**
 * The composer's input line and toolbar (`PondComposer.dc.html` `line` +
 * `toolbar`, board 2f): a borderless mono line that is one row at rest and grows
 * with its text, over a row holding ＋ (attach), the research toggle and send. Presentational — the
 * thread, the stream and the attach flow belong to the AITerminal around it.
 *
 * Research is the one road to the web: off by default, spent on a single
 * question. Off it is ink .8 with no fill; on it takes an ink .07 wash and full ink.
 *
 * Send is a 32px circle (40 below md). Off, with nothing to send, it is a quiet
 * disabled fill; on, it is solid ink, and while an answer streams it becomes the
 * stop square.
 */

import { useLayoutEffect } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { cn } from '@/lib/utils'
import { MentionPillOverlay } from './MentionPillOverlay'

export interface ComposerLineProps {
  value: string
  placeholder: string
  /** The line is inert until the thread has loaded. */
  disabled: boolean
  streaming: boolean
  /** True when there is text or an attachment to send. */
  canSend: boolean
  /** The attach control is inert mid-stream and until the thread has loaded. */
  attachDisabled: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** The wrapper the selection popover anchors to. */
  anchorRef: RefObject<HTMLDivElement | null>
  /** Deep research is on for the next question. */
  research: boolean
  /** Titles of the live whole-page references (KAN-99's `@`-picker mention pill). */
  mentionTitles: readonly string[]
  /** The hidden file input the ＋ opens. */
  attachInput?: ReactNode
  onToggleResearch: () => void
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onAttach: () => void
  onSend: () => void
  onStop: () => void
}

export const ComposerLine = ({
  value,
  placeholder,
  disabled,
  streaming,
  canSend,
  attachDisabled,
  textareaRef,
  anchorRef,
  research,
  mentionTitles,
  attachInput,
  onToggleResearch,
  onChange,
  onKeyDown,
  onAttach,
  onSend,
  onStop,
}: ComposerLineProps) => {
  // The card is anchored at the bottom, so a taller line grows it upward. Capped
  // at six lines, past which the line scrolls.
  useLayoutEffect(() => {
    const line = textareaRef.current
    if (!line) return
    line.style.height = 'auto'
    line.style.height = `${line.scrollHeight}px`
  }, [value, textareaRef])

  const sendOn = streaming || canSend
  const handleSendClick = () => (streaming ? onStop() : onSend())

  return (
    <>
      <div ref={anchorRef} className="relative">
        <MentionPillOverlay value={value} titles={mentionTitles} textareaRef={textareaRef} />
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          aria-label="Message Pond"
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            'block max-h-[calc(6*1.5em_+_4px)] w-full resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-0.5 font-mono text-[16px] leading-[1.5] tracking-[0.02em] outline-none [scrollbar-gutter:stable] placeholder:text-mn-text-secondary disabled:opacity-60 md:text-[14px]',
            value ? 'text-mn-text' : 'text-mn-text-secondary'
          )}
        />
      </div>
      <div className="flex items-center gap-2 text-[11px] tracking-[0.02em]">
        {attachInput}
        {/*
          `PondComposer.dc.html` sets `small = mob ? 36 : 28`, but 6z frame 7's
          caption and AUDIT X1 both put every mobile control at 44px — two
          sources against the DC's one, and it's the documented minimum.
          Deliberate exception to ADR 0011 (DC over storyboard) pending a
          design-side correction to the DC.
        */}
        <button
          type="button"
          aria-label="Attach a file"
          title="Attach a file — images, pdf, txt, md, csv · up to 10MB · html up to 20MB"
          onClick={onAttach}
          disabled={attachDisabled}
          className="flex size-11 flex-none items-center justify-center rounded-mn-pill bg-mn-hover-fill text-mn-text-meta transition-colors hover:text-mn-text disabled:opacity-40 md:size-7"
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
            <path d="M7 3v8M3 7h8" />
          </svg>
        </button>
        <button
          type="button"
          aria-pressed={research}
          onClick={onToggleResearch}
          className={cn(
            'flex items-center gap-[7px] rounded-mn-pill px-3 py-[11px] transition-colors md:py-[7px]',
            research ? 'bg-mn-hover-fill text-mn-text' : 'text-mn-text-meta hover:text-mn-text'
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
            <circle cx="6.2" cy="6.2" r="4" />
            <path d="M9.2 9.2 12.2 12.2" />
          </svg>
          research
        </button>
        <button
          type="button"
          aria-label={streaming ? 'Stop' : 'Send'}
          onClick={handleSendClick}
          disabled={!sendOn}
          className={cn(
            'ml-auto flex size-11 flex-none items-center justify-center rounded-mn-pill md:size-8',
            sendOn
              ? 'bg-mn-text text-raw-paper shadow-[0_4px_12px_rgba(27,29,20,0.22)] dark:text-raw-ink dark:shadow-none'
              : 'bg-[rgba(27,29,20,0.12)] text-mn-text-meta dark:bg-[rgba(250,249,239,0.12)]'
          )}
        >
          {streaming ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect x="1.5" y="1.5" width="7" height="7" rx="1.2" fill="currentColor" />
            </svg>
          ) : (
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
          )}
        </button>
      </div>
    </>
  )
}
