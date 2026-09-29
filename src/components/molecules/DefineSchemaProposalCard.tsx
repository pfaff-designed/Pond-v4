'use client'

/**
 * The proposal card for an AI `define_schema` tool call (#17 slice 5).
 *
 * One define_schema call proposes turning an EXISTING page into a collection by
 * giving it a typed property schema — an ordered list of columns (name + type,
 * plus option labels for select/status). This card previews those columns inline
 * in the chat stream and lets the user accept, reject, or correct WHICH page the
 * schema applies to before anything is written. It follows the same architecture
 * as CreatePageProposalCard: purely presentational — the terminal owns the
 * decision state, the target resolution, and the write path; this component only
 * renders and raises intents.
 *
 * The AI proposes id-less properties (the model never mints stable ids); the
 * preview keys off array index, and the real ids are minted on accept. Press
 * aesthetics throughout — kicker header, hairline rows, display-serif title, a
 * "Apply to" destination select, sage accent — reusing the create-page card's
 * ProposalActions atom relabelled for the schema gesture.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import { ProposalActions, type ProposalStatus } from '@/components/atoms/ProposalActions'
import { TOP_LEVEL_VALUE, type ParentOption } from './CreatePageProposalCard'
import type { AiPropertyDef } from '@/lib/properties/schema'

/** A rollup's definition previewed by name — "sum of Amount via Purchases" (#20). */
function rollupSummary(p: AiPropertyDef): string {
  const via = p.relation ? ` via ${p.relation}` : ''
  if (p.aggregate === 'count') return `count${via}`
  const prop = p.rollupProperty ? ` of ${p.rollupProperty}` : ''
  return `${p.aggregate ?? 'rollup'}${prop}${via}`
}

/**
 * A relation's target previewed as the RESOLVED collection — "→ Trips" — or the
 * proposed name flagged when no collection matches, so the user can correct it
 * before accept (#37, relation spec decision 8). An unmatched name isn't an
 * error: accept leaves the relation untargeted (link any page), lenient.
 */
function relationTargetSummary(target: string, resolvedTitle: string | undefined): string {
  return resolvedTitle ? `→ ${resolvedTitle}` : `→ ${target} · no match`
}

interface DefineSchemaProposalCardProps {
  /** The ordered properties (columns) the AI proposed — previewed read-only. */
  properties: AiPropertyDef[]
  /** Optional one-line note from the model on what the schema is for. */
  reason?: string
  /** The currently-selected target page id (the page the schema applies to). */
  selectedTargetId: string
  /** Candidate pages for the destination picker. */
  targetOptions: ParentOption[]
  /** pending → actions + picker shown; accepted/rejected → resolved status line. */
  status?: ProposalStatus
  /** Resolve a relation's proposed target NAME to the matching collection's
   *  canonical title (#37) — the accept-path rules (collectionTitleResolver);
   *  undefined flags the name as unmatched on the preview. */
  resolveTargetTitle: (name: string) => string | undefined
  /**
   * #52 fix 1 — the NAMES of proposed rollups whose relation won't resolve to a relation
   * on the RESULTING collection (a reverse/backlink count is unsupported). Recomputed for
   * the SELECTED target as the picker changes (accept-path rules, unresolvableRollupNames)
   * so the pending preview flags "· no such relation here" on those rollups. Empty ⇒ every
   * rollup links.
   */
  unresolvableRollups?: Set<string>
  /**
   * #52 fix 1 — the rollup NAMES that ended up inert, FROZEN at accept time (the write
   * computes it). Drives the honest resolved receipt ("Schema defined · 1 rollup couldn't
   * be linked"). Empty/absent ⇒ the flat "Schema defined".
   */
  resolvedInertRollups?: string[]
  onTargetChange: (targetId: string) => void
  onAccept: () => void
  onReject: () => void
  className?: string
}

export function DefineSchemaProposalCard({
  properties,
  reason,
  selectedTargetId,
  targetOptions,
  status = 'pending',
  resolveTargetTitle,
  unresolvableRollups,
  resolvedInertRollups,
  onTargetChange,
  onAccept,
  onReject,
  className,
}: DefineSchemaProposalCardProps) {
  const resolved = status !== 'pending'
  const inertCount = resolvedInertRollups?.length ?? 0
  // Unique per instance — multiple define_schema cards can render in one chat
  // stream, so a hard-coded id would collide and mis-target the label's htmlFor.
  const targetSelectId = useId()

  return (
    <div
      role="group"
      aria-label="Proposed page schema"
      className={cn(
        'press-letter overflow-hidden rounded-mn-inner text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "New schema" kicker + property count */}
      <div className="flex items-center justify-between border-b border-press-hair px-3 py-1.5">
        <span className={pressKickerClass}>
          New schema · {properties.length} {properties.length === 1 ? 'property' : 'properties'}
        </span>
      </div>

      {reason && <p className="px-3 pt-2.5 font-serif text-xs italic text-press-muted">{reason}</p>}

      {/* Column preview — one hairline row per property: name + type chip, with
          option labels shown quietly for a select/status. Height-bounded with
          internal scroll so a wide schema can't push the picker + actions out of
          the auto-grown drawer. */}
      {properties.length > 0 && (
        <dl className="mx-3 mt-2 max-h-[200px] divide-y divide-press-hair overflow-y-auto rounded-mn-row bg-press-accent-wash px-3 text-sm">
          {properties.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="font-serif text-press-body">{p.name}</dt>
              <dd className="flex items-baseline gap-2 text-right">
                {(p.type === 'select' || p.type === 'status') && p.options?.length ? (
                  <span className="font-serif text-xs italic text-press-muted">
                    {p.options.map((o) => o.label).join(' · ')}
                  </span>
                ) : null}
                {p.type === 'relation' && p.target ? (
                  <span className="font-serif text-xs italic text-press-muted">
                    {relationTargetSummary(p.target, resolveTargetTitle(p.target))}
                  </span>
                ) : null}
                {p.type === 'rollup' ? (
                  <span className="font-serif text-xs italic text-press-muted">
                    {rollupSummary(p)}
                    {unresolvableRollups?.has(p.name) ? ' · no such relation here' : ''}
                  </span>
                ) : null}
                <span className={cn(pressKickerClass, 'text-press-muted')}>{p.type}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Destination picker — which page the schema applies to */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={targetSelectId} className="text-xs text-press-muted">
          Apply to
        </label>
        <select
          id={targetSelectId}
          aria-label="Target page"
          value={selectedTargetId}
          disabled={resolved}
          onChange={(e) => onTargetChange(e.target.value)}
          className="flex-1 rounded-mn-chrome border border-press-line bg-press-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-press-accent disabled:opacity-60"
        >
          {/* No page resolved yet (target not found in the list): a disabled hint. */}
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
          schema gesture), or a domain-apt resolved status line. */}
      {resolved ? (
        <div
          aria-live="polite"
          className="mt-2.5 border-t border-press-hair px-3 py-1.5 font-serif text-xs italic text-press-muted"
        >
          {status === 'accepted'
            ? inertCount > 0
              ? `Schema defined · ${inertCount} rollup${inertCount > 1 ? 's' : ''} couldn’t be linked`
              : 'Schema defined'
            : 'Dismissed'}
        </div>
      ) : (
        <ProposalActions
          status="pending"
          onAccept={onAccept}
          onReject={onReject}
          labels={{ accept: 'Define schema', reject: 'Dismiss' }}
          className="mt-2.5"
        />
      )}
    </div>
  )
}
