'use client'

/**
 * A single AI-proposed composition change, rendered as a typed diff card (t16
 * branch 6). Renders any module change by `op` —
 *   - `create` → new-content preview (no "before"),
 *   - `edit`   → before/after (a type-morph shows the old type's view struck, the
 *                new type's view as the proposal),
 *   - `remove` → removal preview.
 *
 * The typed body is delegated to the module's `differ` facet when it declares one
 * (today only `text`); otherwise the card falls back to rendering each side through
 * the read-only `ModuleView`, so a module needs a bespoke differ only when the plain
 * before/after view isn't good enough. Purely presentational — the terminal (Phase 5)
 * owns all state, the accept/reject wiring, and the write path.
 *
 * Note: `before`/`after` are full {@link Block}s (id-ful). A proposed `create`/`edit`
 * carries no id until accept, so Phase 5 passes a preview block with a placeholder
 * id here and mints the real one on accept.
 */

import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import type { Block } from '@/lib/documents/types'
import type { ModuleRenderer } from '@/lib/modules/types'
import { ModuleView, moduleRenderers } from '@/lib/modules/renderers'
import { ProposalActions, type ProposalStatus } from '@/components/atoms/ProposalActions'

export type ChangeOp = 'create' | 'edit' | 'remove'

const OP_LABEL: Record<ChangeOp, string> = {
  create: 'addition',
  edit: 'edit',
  remove: 'removal',
}

interface ModuleDiffCardProps {
  op: ChangeOp
  /** The existing block (edit / remove). Null for a create. */
  before?: Block | null
  /** The proposed block (create / edit). Null for a remove. */
  after?: Block | null
  /** Optional one-line note from the model on what changed and why. */
  reason?: string
  /** Ticket-30: true when the model INFERRED this change as a side-effect rather
   *  than the user explicitly requesting it — shown as a distinct badge so the
   *  user decides it as its own thing. */
  inferred?: boolean
  /** pending → actions shown; accepted/rejected → resolved status line. */
  status?: ProposalStatus
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
  className?: string
}

type BlockDiffer = ComponentType<{ before: Block | null; after: Block }>

/** A block rendered read-only through the registry, dimmed to read as the "before" side. */
function Faded({ block }: { block: Block }) {
  return (
    <div className="opacity-50">
      <ModuleView type={block.type} data={block} />
    </div>
  )
}

function ChangeBody({ op, before, after }: Pick<ModuleDiffCardProps, 'op' | 'before' | 'after'>) {
  if (op === 'remove') {
    if (!before) return null
    return (
      <div className="space-y-1.5">
        <span className="block font-serif text-xs italic text-press-faint">Will be removed</span>
        <Faded block={before} />
      </div>
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

  // Fallback (and the type-morph case): render each side through ModuleView.
  return (
    <div className="space-y-2">
      {op === 'edit' && before ? (
        <Faded block={before} />
      ) : (
        <span className="block font-serif text-xs italic text-press-faint">New {after.type}</span>
      )}
      <ModuleView type={after.type} data={after} />
    </div>
  )
}

export function ModuleDiffCard({
  op,
  before,
  after,
  reason,
  inferred = false,
  status = 'pending',
  onAccept,
  onReject,
  onEdit,
  className,
}: ModuleDiffCardProps) {
  const resolved = status !== 'pending'
  const type = (after ?? before)?.type ?? 'block'

  return (
    <div
      role="group"
      aria-label={`Proposed ${OP_LABEL[op]}`}
      className={cn(
        'press-letter overflow-hidden rounded-lg text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — a letterpress kicker in the correspondence serif */}
      <div className="flex items-center justify-between border-b border-press-hair px-3 py-1.5">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-press-muted">
          Proposed {OP_LABEL[op]} · {type}
        </span>
        {inferred && (
          <span className="rounded-full bg-press-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-press-accent">
            Inferred
          </span>
        )}
      </div>

      {/* Typed body */}
      <div className="px-3 py-2 text-sm">
        <ChangeBody op={op} before={before} after={after} />
      </div>

      {reason && <p className="px-3 pb-2 font-serif text-xs italic text-press-muted">{reason}</p>}

      <ProposalActions status={status} onAccept={onAccept} onReject={onReject} onEdit={onEdit} />
    </div>
  )
}
