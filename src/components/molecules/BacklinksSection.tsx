'use client'

/**
 * The read-only "Linked from" section (#39) — a page's backlinks, the reverse of the
 * one-way relations that point AT it. Purely presentational: the derived groups and the
 * click-through are injected (the connected `BacklinksPanel` fetches + computes them).
 *
 * Deliberately read-only: backlinks are DERIVED, so there is nothing to unlink from
 * here — removal happens on the FORWARD side (the source row's relation cell), and the
 * reverse then disappears on the next read. Chips reuse `RelationChip` WITHOUT `onRemove`
 * (no ×). An empty set renders nothing — the section is quiet noise on the many pages
 * that nothing links to. Press aesthetics: kicker header, mono group labels, sage chips.
 */

import { RelationChip } from '@/components/atoms/RelationChip'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import { cn } from '@/lib/utils'
import type { BacklinkGroup } from '@/lib/modules/view/compute-backlinks'

export interface BacklinksSectionProps {
  /** The inbound links, grouped by source property. Empty → renders nothing. */
  groups: BacklinkGroup[]
  /** Open a source row (chip click). */
  onOpen: (id: string) => void
  className?: string
}

export function BacklinksSection({ groups, onOpen, className }: BacklinksSectionProps) {
  if (groups.length === 0) return null

  return (
    <section aria-label="Linked from" className={className}>
      <h2 className={cn(pressKickerClass, 'mb-3 text-press-muted')}>Linked from</h2>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={`${group.sourceCollectionId}:${group.propertyId}`}>
            <p className="mb-1 font-mono text-xs text-press-faint">
              {group.sourceCollectionTitle} · {group.propertyName}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.rows.map((row) => (
                <RelationChip key={row.id} id={row.id} title={row.title} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
