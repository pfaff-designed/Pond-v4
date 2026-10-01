'use client'

/**
 * The proposal card for an AI `promote_table` tool call (#29).
 *
 * One promote_table call proposes converting an EXISTING freeform `table` block on
 * a page into a schema-bound collection: infer a typed property schema from the
 * table's columns, turn each row into a row page, and swap the table block for a
 * table-mode view. The model only names the page + block by id — the terminal reads
 * that table, infers the columns/types, and hands them here as a read-only preview.
 * This card lets the user accept, reject, or correct WHICH page it applies to
 * before anything is written. Like DefineSchemaProposalCard it is purely
 * presentational — the terminal owns the decision state, target resolution, and the
 * write path; this component only renders and raises intents.
 *
 * Press aesthetics throughout — kicker header, hairline rows, display-serif source
 * title, type chips, a "Convert on" destination select, sage accent — reusing the
 * create-page card's ProposalActions atom relabelled for the promote gesture.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { kickerClass } from '@/components/atoms/kicker'
import { ProposalActions, type ProposalStatus } from '@/components/molecules/ProposalActions'
import { TOP_LEVEL_VALUE, type ParentOption } from './CreatePageProposalCard'
import type { PropertyType } from '@/lib/properties/schema'

/** One inferred column previewed on the card — a header name + its inferred type. */
export interface PromotedColumn {
  name: string
  type: PropertyType
}

interface PromoteTableProposalCardProps {
  /** The source table's caption, if it had one (shown as the card's title line). */
  tableTitle?: string
  /** The columns inferred from the table — previewed read-only (name + type chip). */
  columns: PromotedColumn[]
  /** How many data rows will become row pages — shown so the user knows the size. */
  rowCount: number
  /** Optional one-line note from the model on what the collection is for. */
  reason?: string
  /** The currently-selected target page id (the page hosting the table). */
  selectedTargetId: string
  /** Candidate pages for the destination picker (only pages that host a table). */
  targetOptions: ParentOption[]
  /** pending → actions + picker shown; accepted/rejected → resolved status line. */
  status?: ProposalStatus
  onTargetChange: (targetId: string) => void
  onAccept: () => void
  onReject: () => void
  className?: string
}

export function PromoteTableProposalCard({
  tableTitle,
  columns,
  rowCount,
  reason,
  selectedTargetId,
  targetOptions,
  status = 'pending',
  onTargetChange,
  onAccept,
  onReject,
  className,
}: PromoteTableProposalCardProps) {
  const resolved = status !== 'pending'
  // Unique per instance — multiple promote_table cards can render in one chat
  // stream, so a hard-coded id would collide and mis-target the label's htmlFor.
  const targetSelectId = useId()

  return (
    <div
      role="group"
      aria-label="Proposed table conversion"
      className={cn(
        'mn-letter overflow-hidden rounded-mn-inner text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "Convert table" kicker + column count */}
      <div className="flex items-center justify-between border-b border-mn-hair px-3 py-1.5">
        <span className={kickerClass}>
          Convert table · {columns.length} {columns.length === 1 ? 'column' : 'columns'}
        </span>
        <span className={cn(kickerClass, 'text-mn-text-secondary')}>
          {rowCount} {rowCount === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {/* The source table's caption, set as the display-serif line. */}
      <p className="px-3 pt-2.5 font-serif text-sm text-mn-text-meta">
        {tableTitle?.trim() ? (
          tableTitle
        ) : (
          <span className="italic text-mn-text-secondary">Untitled table</span>
        )}
      </p>

      {reason && <p className="px-3 pt-1.5 font-serif text-xs italic text-mn-text-secondary">{reason}</p>}

      {/* Inferred-column preview — one hairline row per column: name + type chip.
          Height-bounded with internal scroll so a wide table can't push the picker +
          actions out of the auto-grown drawer. */}
      {columns.length > 0 && (
        <dl className="mx-3 mt-2 max-h-[200px] divide-y divide-mn-hair overflow-y-auto rounded-mn-row bg-mn-wash px-3 text-sm">
          {columns.map((c, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="font-serif text-mn-text-meta">{c.name}</dt>
              <dd className={cn(kickerClass, 'text-mn-text-secondary')}>{c.type}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Destination picker — which page's table is converted */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={targetSelectId} className="text-xs text-mn-text-secondary">
          Convert on
        </label>
        <select
          id={targetSelectId}
          aria-label="Target page"
          value={selectedTargetId}
          disabled={resolved}
          onChange={(e) => onTargetChange(e.target.value)}
          className="flex-1 rounded-mn-chrome border border-mn-line bg-mn-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-mn-text disabled:opacity-60"
        >
          {/* No page resolved yet (target not in the list): a disabled hint. */}
          {!targetOptions.some((o) => o.id === selectedTargetId) && (
            <option value={TOP_LEVEL_VALUE} disabled>
              Choose a page…
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
          promote gesture), or a domain-apt resolved status line. */}
      {resolved ? (
        <div
          aria-live="polite"
          className="mt-2.5 border-t border-mn-hair px-3 py-1.5 font-serif text-xs italic text-mn-text-secondary"
        >
          {status === 'accepted' ? 'Table converted' : 'Dismissed'}
        </div>
      ) : (
        <ProposalActions
          status="pending"
          onAccept={onAccept}
          onReject={onReject}
          labels={{ accept: 'Convert', reject: 'Dismiss' }}
          className="mt-2.5"
        />
      )}
    </div>
  )
}
