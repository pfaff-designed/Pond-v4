'use client'

import { Markdown } from '@/components/molecules/Markdown'
import type { TextBlock } from './schema'

/**
 * Text `differ` (t16 branch 6 + Fix-4/F8) — the type-specific body slotted into the
 * shared `ModuleDiffCard` shell. Shows the change in typeset markdown (Markdown atom,
 * `terminal` variant) with strike/ins highlighting so the user sees formatted content
 * rather than raw markdown source.
 *
 * Before (if any) is struck through in the diff-removal red — the ONE place red is
 * spent (Make Noise rule: only removals are red); the proposed `after` is rendered
 * in normal ink on the card's faint ground (additions are never red). A null `before`
 * (create op) shows a "New content" marker instead.
 */
export function TextDiffer({ before, after }: { before: TextBlock | null; after: TextBlock }) {
  return (
    <div className="space-y-1.5">
      {before ? (
        <div className="line-through decoration-mn-signal-removal/60 [&_*]:!text-mn-signal-removal">
          <Markdown variant="terminal">{before.content}</Markdown>
        </div>
      ) : (
        <span className="block font-serif text-xs italic text-mn-text-faint">New content</span>
      )}
      <div className="text-mn-text-meta">
        <Markdown variant="terminal">{after.content}</Markdown>
      </div>
    </div>
  )
}
