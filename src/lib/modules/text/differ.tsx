'use client'

import { Markdown } from '@/components/molecules/Markdown'
import { DiffRow } from '@/components/atoms/diff-row'
import type { TextBlock } from './schema'

/**
 * Text `differ` (t16 branch 6 + Fix-4/F8) — the type-specific body slotted into the
 * shared `ModuleDiffCard` shell. Shows the change in typeset markdown (Markdown atom,
 * `terminal` variant) as the board's − / + rows (#98, 6c frame 2), so the user sees
 * formatted content rather than raw markdown source.
 *
 * Before (if any) is a removal row — the ONE place red is spent (Make Noise rule:
 * only removals are red); the proposed `after` is an addition row, ink on the faint
 * ground (additions are never red). A null `before` (create op) renders the
 * addition alone.
 */
export function TextDiffer({ before, after }: { before: TextBlock | null; after: TextBlock }) {
  return (
    <div className="space-y-[3px]">
      {before && (
        <DiffRow kind="remove">
          <Markdown variant="terminal">{before.content}</Markdown>
        </DiffRow>
      )}
      <DiffRow kind="add">
        <Markdown variant="terminal">{after.content}</Markdown>
      </DiffRow>
    </div>
  )
}
