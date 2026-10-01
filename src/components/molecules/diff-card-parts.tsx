'use client'

/**
 * The pieces of the diff card (#98), split out of `ModuleDiffCard` so the card
 * itself reads as header → rows → footer:
 *   - {@link ChangeRows}   — one change as − / + rows, delegating to the module's
 *                            `differ` facet when it declares one;
 *   - {@link OriginalRows} — "show original": the target as it stands, no marks;
 *   - {@link NoteBox}      — the request-changes note to the proposer (6c frame 3).
 * All presentational; the card owns the state.
 */

import { useState, type ComponentType } from 'react'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/documents/types'
import type { ModuleRenderer } from '@/lib/modules/types'
import type { ChangePreview } from '@/lib/modules/preview'
import { ModuleView, moduleRenderers } from '@/lib/modules/renderers'
import { DiffRow } from '@/components/atoms/diff-row'
import { Button } from '@/components/ui/button'
import { proposalButtonClass } from '@/components/molecules/ProposalActions'

type BlockDiffer = ComponentType<{ before: Block | null; after: Block }>

/** One change as diff rows. */
export function ChangeRows({ change }: { change: ChangePreview }) {
  const { op, before, after } = change
  if (op === 'remove') {
    if (!before) return null
    return (
      <DiffRow kind="remove">
        <ModuleView type={before.type} data={before} />
      </DiffRow>
    )
  }
  // create / edit both end in a proposed `after`.
  if (!after) return null
  const isMorph = op === 'edit' && !!before && before.type !== after.type

  // Same-type change with a declared differ → delegate the typed body. Looked up by
  // a plain property read (mirrors ModuleView) so it reads as a registered component,
  // not one created during render.
  const renderer = (moduleRenderers as Record<string, ModuleRenderer<unknown>>)[after.type]
  const Differ = renderer?.differ as BlockDiffer | undefined
  if (!isMorph && Differ) {
    return <Differ before={op === 'edit' ? (before ?? null) : null} after={after} />
  }

  // Fallback (and the type-morph case): each side through ModuleView.
  return (
    <div className="space-y-[3px]">
      {op === 'edit' && before && (
        <DiffRow kind="remove">
          <ModuleView type={before.type} data={before} />
        </DiffRow>
      )}
      <DiffRow kind="add">
        <ModuleView type={after.type} data={after} />
      </DiffRow>
    </div>
  )
}

/** The target as it stands — "show original". No diff marks, no red. */
export function OriginalRows({ changes }: { changes: ChangePreview[] }) {
  return (
    <div data-part="original" className="space-y-[3px] font-mono text-[11px] leading-[1.75]">
      {changes.map((change, i) =>
        change.before ? (
          <div key={i} className="rounded-mn-hair bg-mn-text/[0.04] px-2 py-[2px]">
            <ModuleView type={change.before.type} data={change.before} />
          </div>
        ) : (
          <div key={i} className="px-2 py-[2px] text-mn-text-secondary">
            new block — nothing to show yet
          </div>
        )
      )}
    </div>
  )
}

/** The note typed under the card, addressed to the proposer (6c frame 3). */
export function NoteBox({
  onSend,
  onCancel,
  disabled,
}: {
  onSend: (note: string) => void
  onCancel: () => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const trimmed = draft.trim()
  return (
    <div
      data-part="note-box"
      className="mx-3 mb-3 flex flex-col gap-2 rounded-[10px] bg-background px-[11px] py-[10px] shadow-[inset_0_0_0_1px_var(--mn-text)]"
    >
      <span className="font-mono text-[10.5px] lowercase text-mn-text-secondary">to pond</span>
      <textarea
        aria-label="note to pond"
        autoFocus
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && trimmed) onSend(trimmed)
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="what should change?"
        className="w-full resize-none bg-transparent font-mono text-[12px] leading-[1.55] text-mn-text outline-none placeholder:text-mn-text-faint"
      />
      <div className="flex justify-end gap-[7px]">
        <Button
          size="sm"
          variant="ghost"
          className={cn(proposalButtonClass, 'shadow-none')}
          onClick={onCancel}
        >
          cancel
        </Button>
        <Button
          size="sm"
          variant="default"
          className={proposalButtonClass}
          disabled={disabled || trimmed.length === 0}
          onClick={() => onSend(trimmed)}
        >
          send
        </Button>
      </div>
    </div>
  )
}
