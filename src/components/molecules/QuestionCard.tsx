'use client'

/**
 * QuestionCard (ticket-39 §2) — a branch-pause question in the correspondence.
 *
 * When build-out reaches a decision that is the user's to make, Pond emits one of
 * these: a question, 2-4 option chips (the SHARED FollowupChips molecule), and a
 * free-answer field. It blocks only its own branch — Pond keeps scaffolding the
 * rest — so this card is a quiet inline prompt, not a modal.
 *
 *   - unanswered → the question + option chips + a free-answer input.
 *   - answered   → an inert line recording what the user picked (audit trail,
 *                  matches how resolved proposal cards go inert in ticket-19).
 *
 * Purely presentational: the terminal owns persistence (the answer rides the
 * resolutions envelope) and raises `onAnswer(text, via)`. Press aesthetics:
 * warm card, hairline rule, kicker header, sage accent — no bespoke widgets.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import { FollowupChips } from './FollowupChips'

export type QuestionAnswerVia = 'option' | 'free'

export interface QuestionCardProps {
  /** The decision, phrased plainly. */
  question: string
  /** 2-4 option chips (shared chip molecule); the user may also type an answer. */
  options: string[]
  /** A short label naming the branch this gates (shown in the kicker header). */
  branch?: string
  /** The recorded answer, or undefined while the branch is still open. */
  answer?: string
  /** Raised with the user's answer and how it arrived. */
  onAnswer: (answer: string, via: QuestionAnswerVia) => void
  className?: string
}

export function QuestionCard({
  question,
  options,
  branch,
  answer,
  onAnswer,
  className,
}: QuestionCardProps) {
  const [free, setFree] = useState('')
  const resolved = typeof answer === 'string'

  return (
    <div
      role="group"
      aria-label={`Question: ${question}`}
      className={cn(
        'press-arrive rounded-mn-inner bg-press-accent-wash/60 px-4 py-3 shadow-mn-sm',
        className
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className={pressKickerClass}>{branch ? `Decision · ${branch}` : 'Decision'}</span>
        <span aria-hidden className="h-px flex-1 bg-press-hair" />
      </div>

      <p className="font-serif text-[0.95rem] leading-[1.5] text-press-body">{question}</p>

      {resolved ? (
        // Inert once answered — the branch is closed; keep the audit line.
        <p className="mt-2 font-serif text-xs italic text-press-muted">You answered: {answer}</p>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          <FollowupChips
            chips={options}
            onPick={(chip) => onAnswer(chip, 'option')}
            aria-label="Answer options"
          />
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const text = free.trim()
              if (text) onAnswer(text, 'free')
            }}
          >
            <input
              type="text"
              value={free}
              onChange={(e) => setFree(e.target.value)}
              placeholder="…or answer in your own words"
              aria-label="Free answer"
              className="flex-1 border-0 border-b border-press-line bg-transparent px-0 py-1 font-serif text-sm text-press-body outline-none transition-colors placeholder:text-press-faint focus:border-press-accent"
            />
            <button
              type="submit"
              disabled={!free.trim()}
              className={cn(
                pressKickerClass,
                'pb-1 text-press-accent transition-colors hover:text-press-ink disabled:opacity-40'
              )}
            >
              Answer
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
