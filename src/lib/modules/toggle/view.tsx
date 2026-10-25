'use client'

import { cn } from '@/lib/utils'
import { Caret } from '@/components/atoms/Caret'
import type { ModuleViewProps } from '../types'
import type { ToggleBlock } from './schema'
import { StaticProse } from '../text/static-prose'

/**
 * The ▸ button's own width (9px, `Caret.tsx`) plus the gap beside it (6px,
 * `gap-1.5`) — the body sits under the summary's first word, not under the ▸,
 * matching `Rail.tsx`'s own caret/row gap (KAN-480's own app-over-board choice,
 * no board draws a toggle).
 */
const TOGGLE_BODY_INDENT = 15

/**
 * Read-only view (KAN-480 slice 1, build item 3 of 7). The ▸ click and the hosted,
 * editable summary/body editors land in later items of this ticket — this is
 * static prose both ways, folded by `data.folded` alone.
 */
export function ToggleView({ data }: ModuleViewProps<ToggleBlock>) {
  const folded = data.folded ?? false
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-expanded={!folded}
          className="mt-[0.3em] grid w-[9px] flex-none place-items-center text-mn-text-secondary"
        >
          <Caret className={cn(!folded && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <StaticProse content={data.content} />
        </div>
      </div>
      {!folded && (
        <div style={{ paddingLeft: TOGGLE_BODY_INDENT }}>
          <StaticProse content={data.body ?? ''} />
        </div>
      )}
    </div>
  )
}
