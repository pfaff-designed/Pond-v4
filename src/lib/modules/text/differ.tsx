'use client'

import { PondMolecule } from '@/components/molecules/PondMolecule'
import { DIFF_LINE_CLASS } from '@/components/molecules/diff-line-class'
import { TEXT_DIFF_PROSE_CLASS } from './prose'
import type { TextBlock } from './schema'
import { StaticProse } from './static-prose'

/**
 * Text `differ` — the type-specific body slotted into the shared `ModuleDiffCard`
 * shell. Each side is the block's own typeset document, read by the same parse as
 * the page, set in the diff line's type.
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
          <StaticProse content={before.content} className={TEXT_DIFF_PROSE_CLASS} />
        </PondMolecule>
      )}
      <PondMolecule kind="diff-line" variant="add" className={DIFF_LINE_CLASS}>
        <StaticProse content={after.content} className={TEXT_DIFF_PROSE_CLASS} />
      </PondMolecule>
    </div>
  )
}
