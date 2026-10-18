/**
 * One home for the accept-mark cue (KAN-143) — the visuals, not the store
 * (`accept-marks.ts`) or the diff that names what to mark (`accept-marks-diff.ts`).
 * `PondMolecule`'s row kinds and `BlockCanvas`'s block-level fallback both show
 * this same cue; a second span/label spelling it out is the duplicate AGENTS.md
 * deletes.
 */

import { formatClockTime } from './page-changes'

/** "changed HH:MM" for an accept's timestamp — the mark's own text. */
export function formatChangedLabel(acceptedAt: string): string {
  return `changed ${formatClockTime(acceptedAt)}`
}

/**
 * The mark's own span, after the row's or block's value. Quiet by design
 * (PROJECT_RULES forbids a nudge colour here): ink .8 mono, never orange or
 * wheat. `Pond 06.03` frame 4's exact values: mono 10.5, ink .8, margin-left
 * 10px; `text-mn-text-meta` already IS ink .8 and flips in dark.
 */
export function ChangedMark({ label }: { label?: string }) {
  if (!label) return null
  return (
    <span
      data-part="changed"
      className="font-mono lowercase text-[10.5px] text-mn-text-meta ml-[10px]"
    >
      {label}
    </span>
  )
}
