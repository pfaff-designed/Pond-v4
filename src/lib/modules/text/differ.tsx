'use client'

import { Markdown } from '@/components/molecules/Markdown'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { DIFF_LINE_CLASS } from '@/components/molecules/diff-line-class'
import type { TextBlock } from './schema'

/**
 * Text `differ` (t16 branch 6 + Fix-4/F8) — the type-specific body slotted into the
 * shared `ModuleDiffCard` shell. Shows the change in typeset markdown (Markdown atom,
 * `terminal` variant) as `PondMolecule` diff-lines, so the user sees
 * formatted content rather than raw markdown source.
 *
 * Before (if any) is a removal row — the ONE place red is spent (Make Noise rule:
 * only removals are red); the proposed `after` is an addition line, ink (additions are
 * never red). A null `before` (create op) renders the addition alone.
 */
export function TextDiffer({ before, after }: { before: TextBlock | null; after: TextBlock }) {
  return (
    <div className="flex flex-col gap-[3px]">
      {before && (
        <PondMolecule kind="diff-line" variant="remove" className={DIFF_LINE_CLASS}>
          <Markdown variant="terminal">{before.content}</Markdown>
        </PondMolecule>
      )}
      <PondMolecule kind="diff-line" variant="add" className={DIFF_LINE_CLASS}>
        <Markdown variant="terminal">{after.content}</Markdown>
      </PondMolecule>
    </div>
  )
}
