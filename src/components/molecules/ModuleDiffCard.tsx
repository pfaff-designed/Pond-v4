'use client'

/**
 * The proposed-diff card (t16 branch 6 → #98, board 6c `Pond 06.03`): one
 * `propose_changes` batch rendered as ONE card — header, the changes as − / +
 * rows, and the three buttons. Accept and reject take the WHOLE diff; to keep
 * only part of it you request changes (AUDIT "Decided, 26 sep", 6c).
 *
 * Each change renders by `op` —
 *   - `create` → an addition row (no "before"),
 *   - `edit`   → a removal row then an addition row (a type-morph shows the old
 *                type's view struck, the new type's view as the proposal),
 *   - `remove` → a removal row.
 * The typed body is delegated to the module's `differ` facet when it declares one
 * (today only `text`); otherwise each side renders through the read-only
 * `ModuleView` inside a {@link DiffRow}.
 *
 * The card is a machine surface: PP Neue Montreal Mono, lowercase, 10.5–12.5px.
 * Red `#C55347` is spent on removals and nothing else.
 *
 * Statuses (W6): `pending` shows the buttons; the seven settled statuses each
 * render distinctly — `outdated` greys the card, drops accept and offers revise
 * (G2); `changes_requested` keeps the note that went to Pond under the card;
 * `rejected` folds the card to one line, "rejected — nothing changed", with
 * show proposal / ask again (6c frame 5). "show original" is available alongside
 * the diff: it swaps the rows for the target blocks as they stand.
 *
 * Purely presentational — the terminal owns all state, the write path and the
 * send to Pond. `before`/`after` are full {@link Block}s (id-ful); a proposed
 * block carries a display-only placeholder id until accept mints the real one.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ChangePreview } from '@/lib/modules/preview'
import { machineEyebrowClass, chipBaseClass } from '@/components/atoms/kicker'
import { Button } from '@/components/ui/button'
import { ChangeRows, NoteBox, OriginalRows } from './diff-card-parts'
import {
  ProposalActions,
  proposalButtonClass,
  type ProposalStatus,
} from '@/components/molecules/ProposalActions'

export type ChangeOp = ChangePreview['op']

export interface ModuleDiffCardProps {
  /** Every change in the batch, in emission order. */
  changes: ChangePreview[]
  /** Name of the page this diff writes to on accept (the stamped target). */
  targetName?: string
  /** Ticket-30 review: the batch named a target page that does not exist. A
   *  notice replaces the body's promise and accepting will skip. */
  targetMissing?: boolean
  /** When the target is a page OTHER than the open one, a way there. */
  onOpenTarget?: () => void
  status?: ProposalStatus
  /** The request-changes note that went to Pond (status `changes_requested`). */
  note?: string
  /** This card is Pond's revision of an earlier one. */
  revised?: boolean
  /** Fix-1 (F1a): how many accepted changes could NOT be placed, with reasons. */
  skippedCount?: number
  skippedReasons?: string[]
  /** Quieten the controls while a write is in flight. */
  busy?: boolean
  onAccept: () => void
  onReject: () => void
  /** Request changes: the note typed under the card, addressed to the proposer. */
  onRequestChanges: (note: string) => void
  /** Offered on an outdated card: ask the proposer to redraft against the page
   *  as it now stands. */
  onRevise?: () => void
  /** On a rejected card: send the original question again. */
  onAskAgain?: () => void
  className?: string
}

export function ModuleDiffCard({
  changes,
  targetName,
  targetMissing = false,
  onOpenTarget,
  status = 'pending',
  note,
  revised = false,
  skippedCount = 0,
  skippedReasons = [],
  busy = false,
  onAccept,
  onReject,
  onRequestChanges,
  onRevise,
  onAskAgain,
  className,
}: ModuleDiffCardProps) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showRejected, setShowRejected] = useState(false)

  const resolved = status !== 'pending'
  const kind = revised ? 'revised edit' : 'proposed edit'
  const count = changes.length
  const folded = status === 'rejected' && !showRejected

  return (
    <div
      role="group"
      aria-label={kind}
      data-status={status}
      className={cn(
        // ticket-41: on resolve the card SETTLES to inert — eases opacity down
        // and a hair of scale (motion-resolve transition) instead of snapping
        // grey, so a decision reads as the card coming to rest. Guarded.
        'motion-resolve space-y-2 text-left',
        resolved && 'scale-[0.99] opacity-70',
        className
      )}
    >
      {status === 'rejected' && (
        // 6c frame 5: reject closes the card and leaves one line in the thread,
        // with ask again / show proposal. The proposal can be unfolded below.
        <div className="flex flex-col gap-2">
          <div
            data-part="status"
            className="font-mono text-[12.5px] tracking-[0.02em] text-mn-text-meta"
          >
            rejected — nothing changed
          </div>
          <div className="flex items-center gap-[7px] font-mono text-[11px] tracking-[0.02em]">
            {onAskAgain && (
              <button
                type="button"
                onClick={onAskAgain}
                className={cn(chipBaseClass, 'py-[6px] text-mn-text-meta')}
              >
                ask again
              </button>
            )}
            <button
              type="button"
              aria-pressed={showRejected}
              onClick={() => setShowRejected((v) => !v)}
              className={cn(chipBaseClass, 'py-[6px] text-mn-text-meta')}
            >
              {showRejected ? 'hide proposal' : 'show proposal'}
            </button>
          </div>
        </div>
      )}
      {!folded && (
        <>
          <div className="mn-letter overflow-hidden rounded-mn-inner">
            {/* Header — the machine eyebrow: "proposed edit — <page>" · "N changes" */}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className={cn(machineEyebrowClass, 'min-w-0 truncate')}>
                {kind}
                {targetName ? ` — ${targetName}` : ''}
              </span>
              <span className="flex flex-none items-center gap-2 font-mono text-[10.5px] lowercase text-mn-text-meta">
                {onOpenTarget && (
                  <button
                    type="button"
                    onClick={onOpenTarget}
                    className="underline underline-offset-2 hover:text-mn-text"
                  >
                    open page
                  </button>
                )}
                <span>
                  {count} change{count === 1 ? '' : 's'}
                </span>
              </span>
            </div>

            {/* Body — the diff rows, or the original when asked for */}
            <div className="px-3 pb-2">
              {targetMissing && (
                <p className="mb-2 font-mono text-[11px] lowercase text-mn-text-meta">
                  target page not found — this proposal can’t be applied.
                </p>
              )}
              {showOriginal ? (
                <OriginalRows changes={changes} />
              ) : (
                <div className="space-y-2">
                  {changes.map((change, i) => (
                    <div key={i} className="space-y-1">
                      <ChangeRows change={change} />
                      {(change.reason || change.inferred) && (
                        <div className="flex items-baseline gap-2 px-2 font-mono text-[10.5px] lowercase text-mn-text-secondary">
                          {change.inferred && (
                            // Ticket-30: the model INFERRED this change as a side-effect.
                            // The whole diff decides together now; the badge tells the
                            // person what to name in a request-changes note.
                            <span className="rounded-mn-pill bg-mn-selected-fill px-2 py-0.5 tracking-wider text-mn-text">
                              inferred
                            </span>
                          )}
                          {change.reason && <span>{change.reason}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer — buttons, or the status the card settled on */}
            {status === 'pending' ? (
              <>
                <ProposalActions
                  status="pending"
                  disabled={busy || targetMissing}
                  onAccept={onAccept}
                  onReject={onReject}
                  onRequestChanges={noteOpen ? undefined : () => setNoteOpen(true)}
                />
                {noteOpen && (
                  <NoteBox
                    disabled={busy}
                    onCancel={() => setNoteOpen(false)}
                    onSend={(text) => {
                      setNoteOpen(false)
                      onRequestChanges(text)
                    }}
                  />
                )}
              </>
            ) : status === 'outdated' ? (
              // G2: accept is withdrawn and revise is offered. The status reads as
              // the outlined pill the change-log rows draw for it.
              <div className="flex flex-wrap items-center gap-[7px] border-t border-mn-hair px-3 py-2">
                <span
                  data-part="status"
                  className="rounded-mn-pill border border-mn-line px-2 py-0.5 font-mono text-[10.5px] lowercase"
                >
                  outdated
                </span>
                <span className="font-mono text-[10.5px] lowercase text-mn-text-secondary">
                  the page changed after this was proposed
                </span>
                {onRevise && (
                  <Button
                    size="sm"
                    variant="default"
                    className={cn(proposalButtonClass, 'ml-auto')}
                    disabled={busy}
                    onClick={onRevise}
                  >
                    revise
                  </Button>
                )}
              </div>
            ) : (
              <>
                <ProposalActions status={status} onAccept={onAccept} onReject={onReject} />
                {status === 'changes_requested' && note && (
                  // The note that went to the proposer stays under the card.
                  <div
                    data-part="note"
                    className="mx-3 mb-3 flex flex-col gap-1 rounded-[10px] bg-mn-text/[0.04] px-[11px] py-[10px] font-mono"
                  >
                    <span className="text-[10.5px] lowercase text-mn-text-secondary">to pond</span>
                    <span className="text-[12px] leading-[1.55] text-mn-text">{note}</span>
                  </div>
                )}
              </>
            )}

            {/* Fix-1 (F1a): honest skip notice — an accept that lands nothing says so. */}
            {skippedCount > 0 && (
              <div
                role="note"
                className="space-y-0.5 px-3 pb-2 font-mono text-[10.5px] lowercase text-mn-text-meta"
              >
                {skippedReasons.length > 0 ? (
                  skippedReasons.map((reason, i) => <p key={i}>couldn’t place — {reason}</p>)
                ) : (
                  <p>
                    {skippedCount} change{skippedCount > 1 ? 's' : ''} couldn’t be placed and{' '}
                    {skippedCount > 1 ? 'were' : 'was'} skipped.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Below the card: show original ↔ show diff (6c frame 2) */}
          <div className="flex items-center gap-[7px] font-mono text-[11px] tracking-[0.02em]">
            <button
              type="button"
              aria-pressed={showOriginal}
              onClick={() => setShowOriginal((v) => !v)}
              className={cn(chipBaseClass, 'py-[6px] text-mn-text-meta')}
            >
              {showOriginal ? 'show diff' : 'show original'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
