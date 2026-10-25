'use client'

import type { ModuleViewProps } from '../types'
import type { ToggleBlock } from './schema'

/**
 * Placeholder static view (KAN-480 slice 1, build item 1 of 7). The ▸ fold control
 * and the hosted summary/body editors land in later build items of this ticket —
 * this renders enough that an already-persisted toggle block never shows nothing.
 */
export function ToggleView({ data }: ModuleViewProps<ToggleBlock>) {
  return (
    <div className="flex flex-col gap-1">
      <div>{data.content}</div>
      {!data.folded && data.body && <div>{data.body}</div>}
    </div>
  )
}
