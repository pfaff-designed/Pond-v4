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
        'rounded-lg border border-zinc-200 bg-white text-left shadow-sm',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "New page" kicker + type/kind tag */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          New page · {label}
        </span>
      </div>

      {/* Title + optional note */}
      <div className="px-3 pt-2.5">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {reason && <p className="mt-0.5 text-xs text-zinc-500">{reason}</p>}
      </div>

      {/* Scaffolded block preview */}
      {previewBlocks.length > 0 && (
        <div className="mx-3 mt-2 space-y-2 rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-sm">
          {previewBlocks.map((b) => (
            <ModuleView key={b.id} type={b.type} data={b} />
          ))}
        </div>
      )}

      {/* Destination picker — the user can correct the inferred placement */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={parentSelectId} className="text-xs text-zinc-500">
          Save to
        </label>
        <select
          id={parentSelectId}
          aria-label="Destination"
          value={selectedParentId}
          disabled={resolved}
          onChange={(e) => onParentChange(e.target.value)}
          className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
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
          className="mt-2.5 border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-500"
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
