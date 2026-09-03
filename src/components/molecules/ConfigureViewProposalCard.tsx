'use client'

/**
 * The proposal card for an AI `configure_view` tool call (#19 slice 5).
 *
 * One configure_view call proposes SELECTING a layout (table/board/calendar/gallery)
 * for an EXISTING collection's rows, plus an optional single-clause group-by / sort /
 * filter. The model names every property by NAME (never the stable id); this card
 * previews the chosen mode + those clauses inline in the chat stream and lets the
 * user accept, reject, or correct WHICH collection the view is configured on before
 * anything is written. It follows the same architecture as AddRowProposalCard: purely
 * presentational — the terminal owns the decision state, the target resolution, and
 * the write path; this component only renders and raises intents.
 *
 * The picker lists only collections (pages that carry a `_schema`); the terminal
 * filters `parentOptions` down before handing them here. Press aesthetics throughout
 * — kicker header, hairline rows, display-serif mode line, a "Configure on"
 * destination select, sage accent — reusing the create-page card's ProposalActions
 * atom relabelled for the configure-view gesture.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import { ProposalActions, type ProposalStatus } from '@/components/atoms/ProposalActions'
import { TOP_LEVEL_VALUE, type ParentOption } from './CreatePageProposalCard'
import type { ViewMode, ViewSort, FilterOp } from '@/lib/modules/view/schema'

/** The proposed sort clause, keyed by property NAME (previewed read-only). */
export interface ConfigureViewSort {
  key: string
  dir: ViewSort['dir']
}

/** The proposed filter clause, keyed by property NAME (previewed read-only). */
export interface ConfigureViewFilter {
  property: string
  op: FilterOp
  value: string
}

interface ConfigureViewProposalCardProps {
  /** Which of the four existing renderers draws the rows. */
  mode: ViewMode
  /** Board group-by — a property NAME (present for a board). */
  groupBy?: string
  /** Single-key sort — a property NAME + direction. */
  sort?: ConfigureViewSort
  /** Single-clause filter — a property NAME `op` a scalar (label for select/status). */
  filter?: ConfigureViewFilter
  /** Optional one-line note from the model on what the view is for. */
  reason?: string
  /** The currently-selected target collection id (the collection this view is on). */
  selectedTargetId: string
  /** Candidate collections for the destination picker (only pages with a schema). */
  targetOptions: ParentOption[]
  /** pending → actions + picker shown; accepted/rejected → resolved status line. */
  status?: ProposalStatus
  onTargetChange: (targetId: string) => void
  onAccept: () => void
  onReject: () => void
  className?: string
}

/** Title-case a mode for the display-serif line (table → Table, etc.). */
const MODE_LABEL: Record<ViewMode, string> = {
  table: 'Table',
  board: 'Board',
  calendar: 'Calendar',
  gallery: 'Gallery',
}

/** A short human phrase for a filter operator, for the read-only preview. */
const OP_LABEL: Record<FilterOp, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  gt: '>',
  lt: '<',
}

export function ConfigureViewProposalCard({
  mode,
  groupBy,
  sort,
  filter,
  reason,
  selectedTargetId,
  targetOptions,
  status = 'pending',
  onTargetChange,
  onAccept,
  onReject,
  className,
}: ConfigureViewProposalCardProps) {
  const resolved = status !== 'pending'
  // Unique per instance — multiple configure_view cards can render in one chat
  // stream, so a hard-coded id would collide and mis-target the label's htmlFor.
  const targetSelectId = useId()

  // The resolved config, as hairline rows — only the clauses the model actually
  // proposed (an absent groupBy/sort/filter renders nothing, never a blank row).
  const clauses: Array<{ label: string; value: string }> = []
  if (groupBy?.trim()) clauses.push({ label: 'Grouped by', value: groupBy })
  if (sort?.key.trim()) {
    clauses.push({ label: 'Sorted by', value: `${sort.key} ${sort.dir === 'desc' ? '↓' : '↑'}` })
  }
  if (filter?.property.trim()) {
    clauses.push({
      label: 'Filtered',
      value: `${filter.property} ${OP_LABEL[filter.op]} ${filter.value}`,
    })
  }

  return (
    <div
      role="group"
      aria-label="Proposed view"
      className={cn(
        'press-letter overflow-hidden rounded-lg text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "New view" kicker + the chosen mode */}
      <div className="flex items-center justify-between border-b border-press-hair px-3 py-1.5">
        <span className={pressKickerClass}>New view · {MODE_LABEL[mode]}</span>
      </div>

      {/* The mode, set as the display-serif line. */}
      <p className="px-3 pt-2.5 font-serif text-sm text-press-body">{MODE_LABEL[mode]}</p>

      {reason && <p className="px-3 pt-1.5 font-serif text-xs italic text-press-muted">{reason}</p>}

      {/* Config preview — one hairline row per proposed clause: label + value. */}
      {clauses.length > 0 && (
        <dl className="mx-3 mt-2 max-h-[200px] divide-y divide-press-hair overflow-y-auto rounded-md border border-press-hair bg-press-accent-wash px-3 text-sm">
          {clauses.map((c) => (
            <div key={c.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className={cn(pressKickerClass, 'text-press-muted')}>{c.label}</dt>
              <dd className="text-right font-serif text-press-body">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Destination picker — which collection this view is configured on */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={targetSelectId} className="text-xs text-press-muted">
          Configure on
        </label>
        <select
          id={targetSelectId}
          aria-label="Target collection"
          value={selectedTargetId}
          disabled={resolved}
          onChange={(e) => onTargetChange(e.target.value)}
          className="flex-1 rounded-md border border-press-line bg-press-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-press-accent disabled:opacity-60"
        >
          {/* No collection resolved yet (target not in the list): a disabled hint. */}
          {!targetOptions.some((o) => o.id === selectedTargetId) && (
            <option value={TOP_LEVEL_VALUE} disabled>
              Choose a collection…
            </option>
          )}
          {targetOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Footer — accept / reject (shared ProposalActions atom, relabelled for the
          configure-view gesture), or a domain-apt resolved status line. */}
      {resolved ? (
        <div
          aria-live="polite"
          className="mt-2.5 border-t border-press-hair px-3 py-1.5 font-serif text-xs italic text-press-muted"
        >
          {status === 'accepted' ? 'View configured' : 'Dismissed'}
        </div>
      ) : (
        <ProposalActions
          status="pending"
          onAccept={onAccept}
          onReject={onReject}
          labels={{ accept: 'Apply view', reject: 'Dismiss' }}
          className="mt-2.5"
        />
      )}
    </div>
  )
}
