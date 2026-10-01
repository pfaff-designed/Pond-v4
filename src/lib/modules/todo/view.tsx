'use client'

import type { ModuleViewProps } from '../types'
import type { TodoBlock } from './schema'
import { MarkdownInline } from '@/components/molecules/Markdown'

/**
 * Todo view. An interactive module: editing is folded into the view (checkbox +
 * label field), so `todo` declares no separate `editor`. Every interaction emits a
 * whole new block state via `onChange`. Read-only renders the same rows inert.
 */
export function TodoView({ data, editable, onChange }: ModuleViewProps<TodoBlock>) {
  function patchItem(index: number, patch: Partial<TodoBlock['items'][number]>) {
    onChange?.({
      ...data,
      items: data.items.map((it, k) => (k === index ? { ...it, ...patch } : it)),
    })
  }

  return (
    <ul className="space-y-1">
      {data.items.map((item, j) => (
        <li key={item.id} className="flex items-center gap-2 text-sm text-mn-text">
          <input
            type="checkbox"
            checked={item.checked}
            // ticket-41: on check, the box settles (a hair over-scale back to rest)
            // so the completion reads as a confirming beat — and lands in time with
            // any bound metric's count-up (the metric NumberFlow ticks on the same
            // state change), making the pair feel causal. Applied only when checked
            // so the settle plays on the meaningful direction; guarded globally by
            // the reduced-motion contract in globals.css.
            className={item.checked ? 'motion-check' : undefined}
            disabled={!editable}
            // Read-only rows have a `checked` prop but no `onChange`; mark them
            // `readOnly` so React does not warn about a controlled field without a
            // handler (the warning `disabled` happens to suppress, made explicit and
            // intent-driven so it holds even if `disabled` is ever removed).
            readOnly={!editable}
            onChange={editable ? (e) => patchItem(j, { checked: e.target.checked }) : undefined}
          />
          {editable ? (
            // Editing: raw string input — markdown characters must be editable as-is.
            <input
              className="flex-1 bg-transparent outline-none"
              value={item.label}
              onChange={(e) => patchItem(j, { label: e.target.value })}
            />
          ) : (
            // Read-only: inline markdown rendering (Fix-4 / F8) — bold/italic/code/links
            // without block elements, so "**item**" shows as bold text, not raw asterisks.
            <MarkdownInline
              className={item.checked ? 'flex-1 text-mn-text-secondary line-through' : 'flex-1'}
            >
              {item.label}
            </MarkdownInline>
          )}
        </li>
      ))}
    </ul>
  )
}
