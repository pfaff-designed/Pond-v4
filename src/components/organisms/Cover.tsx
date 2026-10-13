'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'

import { AsciiPondBackground } from '@/components/molecules/AsciiPondBackground'
import { formatCoverClock, timezoneCity } from '@/lib/first-run/cover-clock'

const headerLabelClass =
  'whitespace-nowrap text-[9.5px] font-medium uppercase tracking-[0.11em] text-mn-text-meta'

const subscribeMounted = () => () => {}

/**
 * True only once hydration has committed. The place label and the clock are
 * read from the browser's own timezone and clock, which the server can't
 * know — gating them behind this (rather than computing them during SSR)
 * keeps the server's render and the client's first pass identical text, so
 * React never logs a hydration mismatch.
 */
const useMounted = () => useSyncExternalStore(subscribeMounted, () => true, () => false)

/**
 * The cover — `Pond 05 Shell` 5a / `Pond 06.04` 6d frame 1. Paper (or ink,
 * dark) with nothing on it but a place, the wordmark, a live clock, one
 * field, the drifting ASCII pond behind it all, and the way in. `enter`
 * (empty field, button or ↵) opens the shell bare; typed text carries
 * across as `?ask=` for `DocumentPanel` to pick up — never sent here.
 */
export function Cover() {
  const mounted = useMounted()
  const [clock, setClock] = useState(() => formatCoverClock(new Date()))
  const [text, setText] = useState('')
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => setClock(formatCoverClock(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  const place = mounted ? timezoneCity(Intl.DateTimeFormat().resolvedOptions().timeZone) : ''

  const handleEnter = () => {
    const trimmed = text.trim()
    router.push(trimmed === '' ? '/workspace' : `/workspace?ask=${encodeURIComponent(trimmed)}`)
  }

  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleEnter()
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-mn-surface text-mn-text">
      <AsciiPondBackground />

      <div className="absolute inset-x-0 top-0 grid grid-cols-[1fr_auto_1fr] items-center px-6 pt-4">
        <span className={headerLabelClass}>{place}</span>
        <h1 className="m-0 text-center font-serif text-[20px] font-extralight italic leading-none tracking-[-0.035em] text-mn-text">
          pond
        </h1>
        <div className="flex items-center justify-end gap-2.5">
          <span className="text-[9.5px] text-[rgba(27,29,20,.42)] dark:text-[rgba(250,249,239,.45)]">
            ·
          </span>
          <span className={headerLabelClass}>
            {mounted ? `${clock.weekday} ${clock.dateLabel}` : ''}
          </span>
          <span className={headerLabelClass}>{mounted ? clock.time : ''}</span>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div className="mn-cover-glass flex w-full max-w-[420px] items-center gap-[11px] rounded-full py-2 pl-4 pr-2 font-mono text-[12.5px] tracking-[0.02em] text-mn-text-secondary">
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleFieldKeyDown}
            placeholder="ask pond"
            aria-label="ask pond"
            className="w-full flex-1 bg-transparent font-mono text-[12.5px] tracking-[0.02em] text-mn-text-secondary caret-mn-text placeholder:text-mn-text-secondary focus:outline-none"
          />
          <span className="rounded-full bg-mn-hover-fill px-[11px] py-1.5 text-[11px] text-mn-text-meta">
            ⌘K
          </span>
          <button
            type="button"
            aria-label="send"
            onClick={handleEnter}
            className="relative flex h-7 w-7 flex-none items-center justify-center rounded-full bg-mn-text text-mn-surface max-md:before:absolute max-md:before:-inset-2 max-md:before:content-['']"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9.6V2.4" />
              <path d="M2.9 5.5 6 2.4l3.1 3.1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-6 pb-5">
        <span className={headerLabelClass}>a make noise production</span>
        <button
          type="button"
          onClick={handleEnter}
          className="relative flex flex-none items-center gap-2 rounded-full border border-mn-text px-4 py-2 text-[9.5px] font-medium uppercase tracking-[0.11em] text-mn-text max-md:before:absolute max-md:before:-inset-2 max-md:before:content-['']"
        >
          enter
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-80"
          >
            <path d="M2.2 7h9.6" />
            <path d="M8.4 3.6 11.8 7l-3.4 3.4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
