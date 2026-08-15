'use client'

import type { ModuleViewProps } from '../types'
import type { TextBlock } from './schema'

/**
 * Text view. When `editable`, an auto-growing textarea emits a whole new block
 * state on change (full-state, per the contract). Read-only renders the markdown
 * source as pre-wrapped prose — no markdown lib is wired yet, so this is faithful
 * to what the document panel shows today.
 */
export function TextView({ data, editable, onChange }: ModuleViewProps<TextBlock>) {
  if (editable) {
    return (
      <textarea
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-zinc-800 outline-none"
        value={data.content}
        rows={Math.max(1, data.content.split('\n').length)}
        placeholder="Write something…"
        onChange={(e) => onChange?.({ ...data, content: e.target.value })}
      />
    )
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{data.content}</p>
}
