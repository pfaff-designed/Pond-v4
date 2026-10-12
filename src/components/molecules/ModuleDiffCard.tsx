'use client'

/**
 * The proposed-diff card (t16 branch 6 → #98, board 6c `Pond 06.03`): one
 * `propose_changes` batch rendered as ONE card — header, the changes as − / +
 * rows, and the three buttons. Accept and reject take the WHOLE diff; to keep
 * only part of it you request changes (AUDIT "Decided, 26 sep", 6c).
 *
 * The card is `PondComposer` `diffCard` (board 2f): padding 12, gap 10, radius 14, paper
 * with the card shadow; a head (`proposed edit — {target}` · `N changes`), the lines as
 * `PondMolecule` diff-lines, then `PondControl` buttons — accept (primary), `⌘↵`,
 * request changes and reject (ghost) — and the target page's name at the right.
 *
 * Each change renders by `op` —
 *   - `create` → an addition row (no "before"),
 *   - `edit`   → a removal row then an addition row (a type-morph shows the old
 *                type's view struck, the new type's view as the proposal),
 *   - `remove` → a removal row.
 * The typed body is delegated to the module's `differ` facet when it declares one
 * (today only `text`); otherwise each side renders through the read-only
 * `ModuleView` inside a diff-line.
 *
 * The card is a machine surface: PP Neue Montreal Mono, 10.5–11.5px. Red `#C55347` is
 * spent on removals and nothing else.
 *
 * Statuses (W6): `pending` shows the buttons; the seven settled statuses each
 * render distinctly — `outdated` greys the card, drops accept and offers revise
 * (G2); `changes_requested` keeps the note that went to Pond under the card;
 * `rejected` folds the card to one line, "rejected — nothing changed", with
 * show proposal / ask again (6c frame 5).
 *
 * There is deliberately NO "busy while the write runs" state here (#98 review).
 * The terminal settles a card the instant it is clicked — `decideChanges` runs
 * before the write starts — so the card is never `pending` while anything is in
 * flight, and a `disabled` on these buttons could not engage. `ProposalActions`
 * keeps its `disabled` for `PageChangesSection`, whose rows do stay pending
 * across their write.
 *
 * Purely presentational — the terminal owns all state, the write path and the
 * send to Pond. `before`/`after` are full {@link Block}s (id-ful); a proposed
 * block carries a display-only placeholder id until accept mints the real one.
 */

import { useId, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { ChangePreview } from '@/lib/modules/preview'
import { chipBaseClass } from '@/components/atoms/kicker'
import { PondControl } from '@/components/atoms/PondControl'
import { ChangeRows, NoteBox } from './diff-card-parts'
import { ProposalActions, type ProposalStatus } from '@/components/molecules/ProposalActions'
import {
  PlaceRow,
  type PlaceOption,
  placeRowClass,
  placeLabelClass,
  placeFieldClass,
} from './place-row'

export interface ModuleDiffCardProps {
  /** Every change in the batch, in emission order. */
  changes: ChangePreview[]
  /** Name of the page this diff writes to on accept (the stamped target). */
  targetName?: string
  /** Ticket-30 review: the batch named a target page that does not exist. A
   *  notice replaces the body's promise and accepting will skip. */
  targetMissing?: boolean
  /** KAN-267: no stamp and no page open — `resolveAcceptTarget` would return
   *  null. Accept is withheld and the place row offered instead of a click
   *  that provably cannot land. */
  needsPlace?: boolean
  parentOptions?: PlaceOption[]
  /** The pond's name, shown as the place row's top-level option. */
  pondName?: string
  /** KAN-267: the pond root names no page to write blocks to, so the place row
   *  never offers it here — the id is always a real page. */
  onPickPlace?: (id: string) => void
  status?: ProposalStatus
  /** The request-changes note that went to Pond (status `changes_requested`). */
  note?: string
  /** This card is Pond's revision of an earlier one. */
  revised?: boolean
  /** Fix-1 (F1a): how many accepted changes could NOT be placed, with reasons. */
  skippedCount?: number
  skippedReasons?: string[]
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

/** `PondControl` size is a prop, not a breakpoint: below md the DC draws the 44px
 *  button (14px type, 20px sides), so the card says so in classes. */
const MOBILE_BUTTON = 'max-md:h-11 max-md:px-5 max-md:text-[14px]'

/** KAN-267 build point 3: N identical reasons render as one line with a count,
 *  in first-occurrence order. */
function countByReason(reasons: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return counts
}

export function ModuleDiffCard({
  changes,
  targetName,
  targetMissing = false,
  needsPlace = false,
  parentOptions,
  pondName,
  onPickPlace,
  status = 'pending',
  note,
  revised = false,
  skippedCount = 0,
  skippedReasons = [],
  onAccept,
  onReject,
  onRequestChanges,
  onRevise,
  onAskAgain,
  className,
}: ModuleDiffCardProps) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const placeRowId = useId()

  const resolved = status !== 'pending'
  const kind = revised ? 'revised edit' : 'proposed edit'
  const count = changes.length
  const folded = status === 'rejected' && !showRejected
  const pending = status === 'pending'

  // ⌘↵ takes the whole diff, from anywhere on the card except a field of its own
  // (the request-changes note sends on ⌘↵ itself).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!pending || targetMissing || needsPlace || e.defaultPrevented) return
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    const field = (e.target as HTMLElement).tagName
    if (field === 'TEXTAREA' || field === 'INPUT') return
    e.preventDefault()
    onAccept()
  }

  return (
    <div
      role="group"
      aria-label={kind}
      data-status={status}
      onKeyDown={handleKeyDown}
      className={cn(
        // ticket-41: on resolve the card SETTLES to inert — eases opacity down
        // and a hair of scale (motion-resolve transition) instead of snapping
        // grey, so a decision reads as the card coming to rest. Guarded.
        'motion-resolve flex flex-col gap-2 text-left',
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
        <div
          data-part="diff-card"
          className="mn-letter flex flex-col gap-[10px] rounded-mn-inner p-3 font-mono text-mn-text"
        >
          <div className="flex items-baseline gap-2 text-[11px]">
            <span data-part="head" className="min-w-0 truncate">
              {kind}
              {targetName ? ` — ${targetName}` : ''}
            </span>
            <div className="flex-1" />
            <span className="whitespace-nowrap text-mn-text-secondary">
              {count} change{count === 1 ? '' : 's'}
            </span>
          </div>

          {targetMissing && (
            <p className="text-[11px] text-mn-text-meta">
              target page not found — this proposal can’t be applied.
            </p>
          )}
          {pending && needsPlace && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] text-mn-text-meta">
                these changes need a place to accept to
              </p>
              <PlaceRow
                id={placeRowId}
                parentId={null}
                parentOptions={parentOptions ?? []}
                pondName={pondName}
                includeRootOption={false}
                onParentChange={(id) => {
                  // The placeholder option is disabled — a real pick is always a page id.
                  if (id !== null) onPickPlace?.(id)
                }}
                rowClassName={placeRowClass}
                labelClassName={placeLabelClass}
                fieldClassName={placeFieldClass}
              />
            </div>
          )}
          <div className="flex flex-col gap-[3px]">
            {changes.map((change, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                <ChangeRows change={change} />
                {change.reason && (
                  <div className="px-2.5 text-[10.5px] text-mn-text-secondary">{change.reason}</div>
                )}
              </div>
            ))}
          </div>

          {/* The actions, or the status the card settled on */}
          {pending ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                <PondControl
                  kind="button"
                  variant="primary"
                  label="accept"
                  disabled={targetMissing || needsPlace}
                  className={MOBILE_BUTTON}
                  onClick={onAccept}
                />
                <span aria-hidden className="-ml-0.5 mr-1 text-mn-text-secondary">
                  ⌘↵
                </span>
                <PondControl
                  kind="button"
                  variant="ghost"
                  label="request changes"
                  className={MOBILE_BUTTON}
                  onClick={() => setNoteOpen(true)}
                  disabled={noteOpen}
                />
                <PondControl
                  kind="button"
                  variant="ghost"
                  label="reject"
                  className={MOBILE_BUTTON}
                  onClick={onReject}
                />
                <div className="flex-1" />
                {targetName && (
                  <span data-part="target" className="min-w-0 truncate text-mn-text-secondary">
                    {targetName}
                  </span>
                )}
              </div>
              {noteOpen && (
                <NoteBox
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
            <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
              <span
                data-part="status"
                className="rounded-mn-pill border border-mn-line px-2 py-0.5"
              >
                outdated
              </span>
              <span className="text-mn-text-secondary">
                the page changed after this was proposed
              </span>
              {onRevise && (
                <PondControl
                  kind="button"
                  variant="primary"
                  label="revise"
                  className={cn(MOBILE_BUTTON, 'ml-auto')}
                  onClick={onRevise}
                />
              )}
            </div>
          ) : (
            <>
              {/* `rejected` already says so in the header line above (6c frame
                    5, "rejected — nothing changed"); a second status element in
                    the footer of an unfolded rejected card said it twice. */}
              {status !== 'rejected' && (
                <ProposalActions
                  status={status}
                  divider={false}
                  onAccept={onAccept}
                  onReject={onReject}
                />
              )}
              {status === 'changes_requested' && note && (
                // The note that went to the proposer stays under the card.
                <div
                  data-part="note"
                  className="flex flex-col gap-1 rounded-[10px] bg-mn-text/[0.04] px-[11px] py-[10px]"
                >
                  <span className="text-[10.5px] text-mn-text-secondary">to pond</span>
                  <span className="text-[12px] leading-[1.55] text-mn-text">{note}</span>
                </div>
              )}
            </>
          )}

          {/* An accept that lands nothing says so. */}
          {skippedCount > 0 && (
            <div role="note" className="space-y-0.5 text-[10.5px] text-mn-text-meta">
              {skippedReasons.length > 0 ? (
                Array.from(countByReason(skippedReasons)).map(([reason, reasonCount]) => (
                  <p key={reason}>
                    {reasonCount} change{reasonCount > 1 ? 's' : ''} couldn’t be placed —{' '}
                    {reason}
                  </p>
                ))
              ) : (
                <p>
                  {skippedCount} change{skippedCount > 1 ? 's' : ''} couldn’t be placed and{' '}
                  {skippedCount > 1 ? 'were' : 'was'} skipped.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
