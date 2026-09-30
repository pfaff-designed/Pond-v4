'use client'

/**
 * StageText (ticket-32) — the whispered progress line under a long generation.
 *
 * While the AI is still working and has streamed no visible answer yet, a bare "…"
 * left the user staring at 25–30s of silence (audit finding 11). This atom shows a
 * single calm stage line derived from the tool-call events already in the stream
 * (see `@/lib/conversation/stage-text` for the part→copy mapping) — "searching the
 * web…", "reading Ceramics Studio Plan…", "drafting your page…".
 *
 * Purely presentational: the caller decides WHEN to render it and passes the resolved
 * `label`. It carries the Press serif of the surrounding correspondence (never a mono
 * console line), sits quiet in `mn-text-secondary`, and breathes with a slow sage pulse so
 * it reads as living, not stalled. The pulse is decorative and disabled under
 * prefers-reduced-motion via Tailwind's `motion-reduce` variant.
 */

export interface StageTextProps {
  /** The resolved human stage line (e.g. "drafting your page…"). */
  label: string
}

export function StageText({ label }: StageTextProps) {
  return (
    <div className="flex items-center gap-2 py-1 pl-0.5" role="status" aria-live="polite">
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-mn-text motion-safe:animate-pulse"
      />
      <span className="font-serif font-extralight text-sm italic text-mn-text-secondary">{label}</span>
    </div>
  )
}
