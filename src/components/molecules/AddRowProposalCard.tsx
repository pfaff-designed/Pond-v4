'use client'

/**
 * The proposal card for an AI `add_row` tool call (#18).
 *
 * One add_row call proposes adding ONE row — a schema-bound child page — to an
 * EXISTING collection. The model provides the row's values keyed by property NAME
 * (it never mints the stable ids); this card previews the title + those name→value
 * pairs inline in the chat stream and lets the user accept, reject, or correct
 * WHICH collection the row is added to before anything is written. It follows the
 * same architecture as DefineSchemaProposalCard: purely presentational — the
 * terminal owns the decision state, the target resolution, and the write path;
 * this component only renders and raises intents.
 *
 * The picker lists only collections (pages that carry a `_schema`); the terminal
 * filters `parentOptions` down before handing them here. Press aesthetics
 * throughout — kicker header, hairline rows, display-serif title, an "Add to"
 * destination select, sage accent — reusing the create-page card's ProposalActions
 * atom relabelled for the add-row gesture.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { kickerClass } from '@/components/atoms/kicker'
import { ProposalActions, type ProposalStatus } from '@/components/molecules/ProposalActions'
import { TOP_LEVEL_VALUE, type ParentOption } from './CreatePageProposalCard'

interface AddRowProposalCardProps {
  /** The new row's title (its page title). */
  title?: string
  /** The proposed values, keyed by property NAME — previewed read-only. */
  props: Record<string, unknown>
  /** Optional one-line note from the model on what the row is. */
  reason?: string
  /** The currently-selected target collection id (the collection the row joins). */
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

/** Render a proposed value for preview — never throws, empties read as an em dash. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function AddRowProposalCard({
  title,
  props,
  reason,
  selectedTargetId,
  targetOptions,
  status = 'pending',
  onTargetChange,
  onAccept,
  onReject,
  className,
}: AddRowProposalCardProps) {
  const resolved = status !== 'pending'
  // Unique per instance — multiple add_row cards can render in one chat stream, so
  // a hard-coded id would collide and mis-target the label's htmlFor.
  const targetSelectId = useId()
  const entries = Object.entries(props ?? {})

  return (
    <div
      role="group"
      aria-label="Proposed row"
      className={cn(
        'mn-letter overflow-hidden rounded-mn-inner text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "New row" kicker + field count */}
      <div className="flex items-center justify-between border-b border-mn-hair px-3 py-1.5">
        <span className={kickerClass}>
          New row · {entries.length} {entries.length === 1 ? 'field' : 'fields'}
        </span>
      </div>

      {/* The row's title, set as the display-serif line. */}
      <p className="px-3 pt-2.5 font-serif text-sm text-mn-text-meta">
        {title?.trim() ? title : <span className="italic text-mn-text-faint">Untitled row</span>}
      </p>

      {reason && <p className="px-3 pt-1.5 font-serif text-xs italic text-mn-text-secondary">{reason}</p>}

      {/* Value preview — one hairline row per provided property: name + value.
          Height-bounded with internal scroll so a wide row can't push the picker +
          actions out of the auto-grown drawer. */}
      {entries.length > 0 && (
        <dl className="mx-3 mt-2 max-h-[200px] divide-y divide-mn-hair overflow-y-auto rounded-mn-row bg-mn-wash px-3 text-sm">
          {entries.map(([name, value]) => (
            <div key={name} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className={cn(kickerClass, 'text-mn-text-secondary')}>{name}</dt>
              <dd className="text-right font-serif text-mn-text-meta">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Destination picker — which collection the row is added to */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={targetSelectId} className="text-xs text-mn-text-secondary">
          Add to
        </label>
        <select
          id={targetSelectId}
          aria-label="Target collection"
          value={selectedTargetId}
          disabled={resolved}
          onChange={(e) => onTargetChange(e.target.value)}
          className="flex-1 rounded-mn-chrome border border-mn-line bg-mn-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-mn-text disabled:opacity-60"
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
          add-row gesture), or a domain-apt resolved status line. */}
      {resolved ? (
        <div
          aria-live="polite"
          className="mt-2.5 border-t border-mn-hair px-3 py-1.5 font-serif text-xs italic text-mn-text-secondary"
        >
          {status === 'accepted' ? 'Row added' : 'Dismissed'}
        </div>
      ) : (
        <ProposalActions
          status="pending"
          onAccept={onAccept}
          onReject={onReject}
          labels={{ accept: 'Add row', reject: 'Dismiss' }}
          className="mt-2.5"
        />
      )}
    </div>
  )
}
