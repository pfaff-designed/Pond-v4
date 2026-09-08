'use client'

/**
 * Inline ghost-suggestion for the composer (ticket-40 §5).
 *
 * Renders a visually-inset greyed completion below/overlaying the empty composer
 * area. Press Tab or → to accept (fills input, does NOT send). Any other keypress
 * vanishes it. Returns null when there is no suggestion so the composer is
 * visually clean.
 *
 * The suggestion text is sourced from the same suggest_followups set as the chip
 * row (t39) — no second suggestion channel.
 *
 * Reduced-motion safe: press-arrive is guarded by the project's global CSS
 * `@media (prefers-reduced-motion: reduce)` override, so no extra checks needed.
 */

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface GhostSuggestionProps {
  /** The suggestion text to show inline. When falsy, renders nothing. */
  suggestion: string | null
  /** The current input value. Ghost only shows when the input is empty. */
  inputValue: string
  /** Called when the user accepts the suggestion (Tab or →). */
  onAccept: (text: string) => void
  /** Called when the ghost should vanish (any other key / input change). */
  onDismiss: () => void
  /** aria-describedby target id for the ghost span, so the textarea can reference it. */
  id?: string
  className?: string
}

/** The ghost element — purely presentational, no interaction. */
export function GhostSuggestion({
  suggestion,
  inputValue,
  onAccept,
  onDismiss,
  id,
  className,
}: GhostSuggestionProps) {
  const prevInput = useRef(inputValue)

  // Dismiss when the user starts typing (inputValue changes).
  useEffect(() => {
    if (inputValue !== prevInput.current && inputValue !== '') {
      prevInput.current = inputValue
      onDismiss()
    } else {
      prevInput.current = inputValue
    }
  }, [inputValue, onDismiss])

  if (!suggestion || inputValue !== '') return null

  // A flex row so the suggestion text truncates within its own cell while the
  // Tab pill stays pinned (flex-shrink-0) and can never be clipped by, or
  // overlap, the truncating text. px-0/py-1.5/font-mono/text-sm mirror the
  // composer textarea exactly so the ghost sits directly over the empty input.
  return (
    <span
      id={id}
      role="status"
      aria-live="polite"
      aria-label={`Ghost suggestion: ${suggestion}`}
      className={cn(
        'press-arrive pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-0 py-1.5',
        'font-mono text-sm text-press-faint/60 select-none',
        className
      )}
    >
      <span className="truncate">{suggestion}</span>
      <span className="flex-shrink-0 rounded border border-press-line/50 px-1 text-[10px] text-press-faint/40">
        Tab
      </span>
    </span>
  )
}

/**
 * Hook that attaches Tab and → key handlers to an element for ghost acceptance.
 * Call this on the composer's textarea ref.
 */
export function useGhostKeyHandler({
  suggestion,
  inputValue,
  onAccept,
  onDismiss,
}: {
  suggestion: string | null
  inputValue: string
  onAccept: (text: string) => void
  onDismiss: () => void
}) {
  return function handleGhostKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggestion || inputValue !== '') return
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      e.preventDefault()
      onAccept(suggestion)
    } else if (e.key !== 'Shift' && e.key !== 'Alt' && e.key !== 'Meta' && e.key !== 'Control') {
      // Any real keystroke dismisses the ghost (the inputValue change will also fire onDismiss,
      // but we dismiss eagerly here so the ghost vanishes before the next render).
      onDismiss()
    }
  }
}
