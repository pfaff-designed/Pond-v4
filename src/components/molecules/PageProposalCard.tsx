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
 * tracking. Values read inline from the frame: the pane is white .72 over the
 * glass with a white .9 border, radius 14, padding 12px 13px, gap 10; the head
 * is the sans eyebrow (500 · 10.5px · .1em · uppercase · ink .68) with "3
 * fields" at 10.5px ink .8; rows are 11px / 1.75 with a 52px label at ink .8;
 * make page is ink on paper, the other two ink .07 fills, all 500 · 11px with
 * 7px 13px padding, pill. Dark takes PondComposer's `diffCard` ink values via
 * the `.mn-proposal` roles.
 */

import { useId, useRef, useState } from 'react'
import { chipBaseClass, eyebrowClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'
import { PAGE_NAME_MAX, type PageProposalStatus } from '@/lib/conversation/page-proposals'

/** A candidate parent (title-resolved and disambiguated upstream). */
export interface PlaceOption {
  id: string
  title: string
}

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

const rowClass = 'flex items-baseline gap-3 px-2 py-0.5'
const labelClass = 'w-[52px] flex-none text-mn-text-meta'
const fieldClass =
  'min-w-0 flex-1 appearance-none border-0 border-b border-transparent bg-transparent p-0 font-mono text-[11px] lowercase tracking-[0.02em] text-foreground outline-none focus:border-mn-text/40'
const controlClass =
  'rounded-mn-pill px-[13px] py-[7px] text-[11px] font-medium leading-none transition-colors disabled:opacity-50'

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
  const underRef = useRef<HTMLSelectElement>(null)
  // "change place" opens the picker; until then the place reads as text, like
  // the frame ("creativity › kitchen renovation"). Both are the same <select>.
  const [placing, setPlacing] = useState(false)

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

  const changePlace = () => {
    setPlacing(true)
    requestAnimationFrame(() => {
      const el = underRef.current
      if (!el) return
      el.focus()
      // Chromium ships showPicker(); elsewhere focus alone is the affordance.
      const withPicker = el as HTMLSelectElement & { showPicker?: () => void }
      try {
        withPicker.showPicker?.()
      } catch {
        /* a user gesture is required in some browsers — focus already landed */
      }
    })
  }

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
        <span className={eyebrowClass}>new page — proposed</span>
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
        <div className={rowClass}>
          <label htmlFor={`${ids}-under`} className={labelClass}>
            under
          </label>
          <select
            ref={underRef}
            id={`${ids}-under`}
            aria-label="under"
            value={parentId ?? ''}
            onChange={(e) => onParentChange(e.target.value || null)}
            onBlur={() => setPlacing(false)}
            className={cn(fieldClass, 'cursor-pointer', placing && 'border-mn-text/40')}
          >
            <option value="">{pondName}</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
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
        <button
          type="button"
          disabled={busy}
          onClick={onMakePage}
          className={cn(controlClass, 'bg-mn-text text-mn-surface hover:bg-mn-text/90')}
        >
          make page
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={changePlace}
          className={cn(controlClass, 'bg-mn-text/[0.07] text-mn-text-meta hover:text-foreground')}
        >
          change place
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={cn(controlClass, 'bg-mn-text/[0.07] text-mn-text-meta hover:text-foreground')}
        >
          cancel
        </button>
      </div>
    </div>
  )
}
