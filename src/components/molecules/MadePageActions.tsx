/**
 * MadePageActions (KAN-179, `Pond 06.01` 6a frame 5) — the chip row the
 * composer swaps in for the thread once a page has been made this session:
 * `undo` always, `open {parentName}` only when the made page has a parent
 * (a top-level proposal offers undo alone). Presentational only — the
 * caller owns the undo/navigate writes.
 *
 * Same chip recipe as `AnswerActions`'s own `chipClass`: `chipBaseClass` +
 * `py-1.5` (PondComposer's `chip`: pill, ink .07 fill, ink .8 text, mono
 * 11px, tracking .02em, 7px gap).
 */

import { chipBaseClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'

export interface MadePageActionsProps {
  onUndo: () => void
  /** The made page's parent name, or null for a top-level proposal. */
  parentName: string | null
  onOpenParent?: () => void
  className?: string
}

const chipClass = cn(chipBaseClass, 'py-1.5 text-mn-text-meta hover:text-foreground')

export function MadePageActions({
  onUndo,
  parentName,
  onOpenParent,
  className,
}: MadePageActionsProps) {
  return (
    <div
      data-part="made-page-actions"
      className={cn(
        'flex items-center gap-[7px] font-mono text-[11px] lowercase tracking-[0.02em]',
        className
      )}
    >
      <button type="button" className={chipClass} onClick={onUndo}>
        undo
      </button>
      {parentName !== null && (
        <button type="button" className={chipClass} onClick={onOpenParent}>
          open {parentName}
        </button>
      )}
    </div>
  )
}
