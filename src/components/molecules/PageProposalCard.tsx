'use client'

/**
 * PageProposalCard (#97, `Pond 06.01` 6a frame 4; 6d frame 4) — the
 * `new page — proposed` card that opens when the person presses **make this a
 * page** on an answer. Three fields, each editable in place — name · under ·
 * kind — and three controls: **make page** / **change place** / **cancel**.
 * Nothing is made until make page (AUDIT § Decided C2). Kind is a free label
 * with no tie to a template (W5).
 *
 * Purely presentational, like its sibling proposal cards: the terminal owns the
 * proposal record, the write path and the change-log advance; this component
 * renders and raises intents.
 *
 * A machine surface (PROJECT_RULES § Design language): mono, lowercase, tight
 * tracking for the body. Values read inline from the frame (and `PondComposer`'s
 * own `card` renderer, its child DC): the pane is white .72 over the glass with
 * a white .9 border, radius 14, padding 12px 13px, gap 10; the head is the SANS
 * eyebrow (500 · 10.5px · .1em · uppercase · ink .68 — the DC's `headSt` is sans
 * for any head that isn't `label: 'mono'` or `/^pond — /`, and this card's head
 * is neither) with "3 fields" at 10.5px ink .8; rows are 11px / 1.75 with a 52px
 * label at ink .8; the three controls are `PondControl kind="button"` at the
 * board's own `desktop` size (h 32, px 14, 500 12px sans) — make page `primary`
 * (ink fill, paper text), change place/cancel `ghost` (transparent, 1px ink .2
 * inset ring, full ink text) — the DC's `btns()` makes the first button primary
 * and the rest ghost. Dark takes PondComposer's `diffCard` ink values via the
 * `.mn-proposal` roles.
 */

import { useId, useRef } from 'react'
import { PondControl } from '@/components/atoms/PondControl'
import { chipBaseClass, pageEyebrowClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'
import { PAGE_NAME_MAX, type PageProposalStatus } from '@/lib/conversation/page-proposals'
import {
  PlaceRow,
  type PlaceOption,
  type PlaceRowHandle,
  placeRowClass,
  placeLabelClass,
  placeFieldClass,
} from '@/components/molecules/place-row'

export type { PlaceOption }

export interface PageProposalCardProps {
  name: string
  /** null = top level — the pond's root. */
  parentId: string | null
  kind: string
  parentOptions: PlaceOption[]
  /** The pond's name, shown as the top-level place. */
  pondName?: string
  status: PageProposalStatus
  /** A failed make page's reason — e.g. the chosen place was deleted. */
  error?: string
  /** Quieten the controls while the write is in flight. */
  busy?: boolean
  onNameChange: (name: string) => void
  onParentChange: (parentId: string | null) => void
  onKindChange: (kind: string) => void
  onMakePage: () => void
  onCancel: () => void
  /** Open the made page (accepted state). */
  onOpenPage?: () => void
  className?: string
}

const rowClass = cn(placeRowClass, 'px-2 py-0.5')
const labelClass = placeLabelClass
const fieldClass = placeFieldClass

export function PageProposalCard({
  name,
  parentId,
  kind,
  parentOptions,
  pondName = 'life',
  status,
  error,
  busy = false,
  onNameChange,
  onParentChange,
  onKindChange,
  onMakePage,
  onCancel,
  onOpenPage,
  className,
}: PageProposalCardProps) {
  const ids = useId()
  const placeRowRef = useRef<PlaceRowHandle>(null)

  if (status === 'rejected') return null

  if (status === 'accepted') {
    return (
      <div
        data-part="page-proposal"
        data-status="accepted"
        className={cn(
          'flex flex-wrap items-center gap-[7px] font-mono text-[11px] lowercase tracking-[0.02em] text-mn-text-secondary',
          className
        )}
      >
        <span>page made</span>
        {onOpenPage && (
          <button
            type="button"
            onClick={onOpenPage}
            className={cn(chipBaseClass, 'py-1.5 text-mn-text-meta hover:text-foreground')}
          >
            open {name}
          </button>
        )}
      </div>
    )
  }

  const changePlace = () => placeRowRef.current?.changePlace()

  return (
    <div
      role="group"
      aria-label={`new page — proposed: ${name}`}
      data-part="page-proposal"
      data-status="proposed"
      className={cn(
        'mn-proposal flex flex-col gap-2.5 rounded-mn-inner px-[13px] py-3 font-mono lowercase tracking-[0.02em] text-foreground',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className={pageEyebrowClass}>new page — proposed</span>
        <span className="text-[10.5px] text-mn-text-meta">3 fields</span>
      </div>

      <div className="text-[11px] leading-[1.75]">
        <div className={rowClass}>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            name
          </label>
          <input
            id={`${ids}-name`}
            aria-label="name"
            value={name}
            maxLength={PAGE_NAME_MAX}
            onChange={(e) => onNameChange(e.target.value)}
            className={fieldClass}
          />
        </div>
        <PlaceRow
          ref={placeRowRef}
          id={`${ids}-under`}
          parentId={parentId}
          parentOptions={parentOptions}
          pondName={pondName}
          onParentChange={onParentChange}
          rowClassName={rowClass}
          labelClassName={labelClass}
          fieldClassName={fieldClass}
        />
        <div className={rowClass}>
          <label htmlFor={`${ids}-kind`} className={labelClass}>
            kind
          </label>
          <input
            id={`${ids}-kind`}
            aria-label="kind"
            value={kind}
            maxLength={40}
            onChange={(e) => onKindChange(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[10.5px] text-mn-text-meta">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-[7px] pt-0.5">
        <PondControl
          kind="button"
          variant="primary"
          label="make page"
          disabled={busy}
          onClick={onMakePage}
        />
        <PondControl
          kind="button"
          variant="ghost"
          label="change place"
          disabled={busy}
          onClick={changePlace}
        />
        <PondControl
          kind="button"
          variant="ghost"
          label="cancel"
          disabled={busy}
          onClick={onCancel}
        />
      </div>
    </div>
  )
}
