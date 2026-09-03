'use client'

import type { ModuleViewProps } from '../types'
import type { ViewBlock } from './schema'

/**
 * View renderer — SLICE 2 STUB.
 *
 * Satisfies the registry `RenderableFence` (every descriptor needs a renderer) and
 * shows the view's configured mode, but does not yet fetch or draw the collection's
 * rows. The real table/board/calendar/gallery renderers — with row hydration,
 * group-by chips via `optionForValue`, and optimistic `set_property` on edit — land
 * in #19 slices 3–4. Kept deliberately minimal and clearly labelled so a view block
 * on a page renders honestly rather than crashing or implying a finished feature.
 */
export function ViewView({ data }: ModuleViewProps<ViewBlock>) {
  const label = data.mode.charAt(0).toUpperCase() + data.mode.slice(1)
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
      {label} view
      <span className="ml-1 text-zinc-400">· rows render in a later slice</span>
    </div>
  )
}
