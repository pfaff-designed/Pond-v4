'use client'

import type { TextBlock } from './schema'

/**
 * Text `differ` (t16 branch 6) — the type-specific body slotted into the shared
 * `ModuleDiffCard` shell. Reproduces the strike/ins treatment the original text-only
 * DiffCard used: `before` (if any) struck through, `after` shown as the proposed
 * content. A null `before` (a create) shows a "New content" marker instead.
 */
export function TextDiffer({ before, after }: { before: TextBlock | null; after: TextBlock }) {
  return (
    <div className="space-y-1.5 text-sm">
      {before ? (
        <del className="block whitespace-pre-wrap text-zinc-400 line-through decoration-zinc-300">
          {before.content}
        </del>
      ) : (
        <span className="block text-xs italic text-zinc-400">New content</span>
      )}
      <ins className="block whitespace-pre-wrap text-zinc-900 no-underline">{after.content}</ins>
    </div>
  )
}
