'use client'

import { Markdown } from '@/components/atoms/Markdown'
import type { TextBlock } from './schema'

/**
 * Text `differ` (t16 branch 6 + Fix-4/F8) — the type-specific body slotted into the
 * shared `ModuleDiffCard` shell. Shows the change in typeset markdown (Markdown atom,
 * `terminal` variant) with strike/ins highlighting so the user sees formatted content
 * rather than raw markdown source.
 *
 * Before (if any) is struck through and dimmed; the proposed `after` is rendered
 * in normal ink. A null `before` (create op) shows a "New content" marker instead.
 */
export function TextDiffer({ before, after }: { before: TextBlock | null; after: TextBlock }) {
  return (
    <div className="space-y-1.5">
      {before ? (
        <div className="opacity-50 line-through decoration-zinc-400">
          <Markdown variant="terminal">{before.content}</Markdown>
        </div>
      ) : (
        <span className="block text-xs italic text-zinc-400">New content</span>
      )}
      <div className="text-zinc-900">
        <Markdown variant="terminal">{after.content}</Markdown>
      </div>
    </div>
  )
}
