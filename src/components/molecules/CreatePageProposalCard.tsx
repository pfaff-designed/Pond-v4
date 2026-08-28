'use client'

/**
 * The proposal card for an AI `create_page` tool call (M1).
 *
 * One create_page call proposes a BRAND-NEW page — title, page type, optional
 * page-kind, an inferred placement (parent), and a scaffold of content blocks. This
 * card previews all of that inline in the chat stream and lets the user accept,
 * reject, or correct the placement before anything is written. It follows the same
 * architecture as the diff-card loop (ModuleDiffCard / ProposalGroup): purely
 * presentational — the terminal owns the decision state, the parent resolution, and
 * the write path; this component only renders and raises intents.
 *
 * Design grounded in Mobbin references for AI-drafts-then-save flows (Semrush
 * "Creating an email": an inline generated-content preview card with an explicit
 * confirm and a link to the created artifact; Todoist "Add folder" / Uvodo "Add
 * menu item": a labelled destination picker). Adopted: inline titled preview + a
 * "Save to" destination select + Accept/Reject. Rejected: a separate modal dialog
 * (Pond's proposals live inline in the chat, like the diff cards) and a multi-draft
 * carousel (create_page proposes one page).
 *
 * The scaffolded blocks are previewed read-only through the module registry
 * (ModuleView), so the user sees the same rendering the page will have.
 */

import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ModuleView } from '@/lib/modules/renderers'
import { stampDisplayIds } from '@/lib/modules/preview'
import { pressKickerClass } from '@/components/atoms/press-kicker'
import { ProposalActions, type ProposalStatus } from '@/components/atoms/ProposalActions'
import type { ModuleData } from '@/lib/modules/ai-composition'
import type { NodeType } from '@/lib/supabase/types'

/** A candidate parent the user can pick for the new page (title-resolved upstream). */
export interface ParentOption {
  /** Page id (empty string = the top-level / no-parent option). */
  id: string
  title: string
}

/** The sentinel value for "top-level (no parent)" in the destination select. */
export const TOP_LEVEL_VALUE = '__top_level__'

interface CreatePageProposalCardProps {
  title: string
  type: NodeType
  /** Page-kind for content pages (recipe, document, …); absent for structural types. */
  kind?: string
  /** Id-less blocks the AI proposed — previewed read-only. */
  blocks: ModuleData[]
  /** Optional one-line note from the model on what the page is for. */
  reason?: string
  /** The currently-selected parent id, or TOP_LEVEL_VALUE for top-level. */
  selectedParentId: string
  /** Candidate parents for the destination picker (top-level is added implicitly). */
  parentOptions: ParentOption[]
  /** pending → actions + picker shown; accepted/rejected → resolved status line. */
  status?: ProposalStatus
  onParentChange: (parentId: string) => void
  onAccept: () => void
  onReject: () => void
  className?: string
}

/** Give each proposed block a stable preview id so ModuleView (and React keys) are
 *  happy; these are throwaway — the real ids are minted on accept. Nested ids
 *  (todo items, table rows, …) are stamped by the shared registry-driven walk. */
function withPreviewIds(blocks: ModuleData[]) {
  return blocks.map((b, i) => stampDisplayIds(b, `preview-${i}`))
}

export function CreatePageProposalCard({
  title,
  type,
  kind,
  blocks,
  reason,
  selectedParentId,
  parentOptions,
  status = 'pending',
  onParentChange,
  onAccept,
  onReject,
  className,
}: CreatePageProposalCardProps) {
  const resolved = status !== 'pending'
  const previewBlocks = useMemo(() => withPreviewIds(blocks), [blocks])
  const label = kind ?? type
  // Unique per instance — multiple create_page cards can render in one chat stream,
  // so a hard-coded id would collide and mis-target the label's htmlFor.
  const parentSelectId = useId()

  return (
    <div
      role="group"
      aria-label={`Proposed new page: ${title}`}
      className={cn(
        'press-letter overflow-hidden rounded-lg text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "New page" kicker + type/kind tag */}
      <div className="flex items-center justify-between border-b border-press-hair px-3 py-1.5">
        <span className={pressKickerClass}>New page · {label}</span>
      </div>

      {/* Title + optional note — the title set in the display serif, like a page head */}
      <div className="px-3 pt-2.5">
        <div className="font-display text-lg leading-tight text-foreground">{title}</div>
        {reason && <p className="mt-0.5 font-serif text-xs italic text-press-muted">{reason}</p>}
      </div>

      {/* Scaffolded block preview. Height-bounded with internal scroll (ticket-24):
          a big scaffold (full tables, long lists) must not push the Save-to picker
          and Create/Dismiss out of the auto-grown drawer — title + preview + picker
          + actions always fit together; only the preview itself scrolls. */}
      {previewBlocks.length > 0 && (
        <div className="mx-3 mt-2 max-h-[200px] space-y-2 overflow-y-auto rounded-md border border-press-hair bg-press-accent-wash px-3 py-2 text-sm">
          {previewBlocks.map((b) => (
            <ModuleView key={b.id} type={b.type} data={b} />
          ))}
        </div>
      )}

      {/* Destination picker — the user can correct the inferred placement */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={parentSelectId} className="text-xs text-press-muted">
          Save to
        </label>
        <select
          id={parentSelectId}
          aria-label="Destination"
          value={selectedParentId}
          disabled={resolved}
          onChange={(e) => onParentChange(e.target.value)}
          className="flex-1 rounded-md border border-press-line bg-press-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-press-accent disabled:opacity-60"
        >
          <option value={TOP_LEVEL_VALUE}>Top level</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Footer — accept / reject (via the shared ProposalActions atom, relabelled
          for the page gesture), or a domain-apt resolved status line. */}
      {resolved ? (
        <div
          aria-live="polite"
          className="mt-2.5 border-t border-press-hair px-3 py-1.5 font-serif text-xs italic text-press-muted"
        >
          {status === 'accepted' ? 'Page created' : 'Dismissed'}
        </div>
      ) : (
        <ProposalActions
          status="pending"
          onAccept={onAccept}
          onReject={onReject}
          labels={{ accept: 'Create page', reject: 'Dismiss' }}
          className="mt-2.5"
        />
      )}
    </div>
  )
}
