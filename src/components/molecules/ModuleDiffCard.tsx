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
import { pressKickerClass } from '@/components/atoms/press-kicker'
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

/** The "before" side of a diff — the content being removed/replaced. Make Noise
 *  spends red on removals ONLY, so this reads in the diff-removal red, struck. */
function Removed({ block }: { block: Block }) {
  return (
    <div className="line-through decoration-mn-signal-removal/60 [&_*]:!text-mn-signal-removal">
      <ModuleView type={block.type} data={block} />
    </div>
  )
}

function ChangeBody({ op, before, after }: Pick<ModuleDiffCardProps, 'op' | 'before' | 'after'>) {
  if (op === 'remove') {
    if (!before) return null
    return (
      <div className="space-y-1.5">
        <span className="block font-serif text-xs italic text-mn-signal-removal">
          Will be removed
        </span>
        <Removed block={before} />
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

  // Fallback (and the type-morph case): render each side through ModuleView. The
  // before side is a removal (struck, red); the after is an addition (ink on the
  // card's faint ground — never red).
  return (
    <div className="space-y-2">
      {op === 'edit' && before ? (
        <Removed block={before} />
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
        // ticket-41: on resolve the card SETTLES to inert — eases opacity down
        // and a hair of scale (motion-resolve transition) instead of snapping
        // grey, so accept/reject reads as the card coming to rest. Guarded.
        'press-letter motion-resolve overflow-hidden rounded-mn-inner text-left',
        resolved && 'scale-[0.99] opacity-70',
        className
      )}
    >
      {/* Header — a letterpress kicker in the correspondence serif */}
      <div className="flex items-center justify-between border-b border-press-hair px-3 py-1.5">
        <span className={pressKickerClass}>
          Proposed {OP_LABEL[op]} · {type}
        </span>
        {inferred && (
          <span className="rounded-mn-pill bg-press-accent-soft px-2 py-0.5 font-mono lowercase tracking-[0.1em] text-[10px] text-press-accent">
            inferred
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
