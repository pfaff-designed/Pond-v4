'use client'

import type { ModuleViewProps } from '../types'
import type { TodoBlock } from './schema'

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
        <li key={item.id} className="flex items-center gap-2 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={item.checked}
            disabled={!editable}
            onChange={editable ? (e) => patchItem(j, { checked: e.target.checked }) : undefined}
          />
          {editable ? (
            <input
              className="flex-1 bg-transparent outline-none"
              value={item.label}
              onChange={(e) => patchItem(j, { label: e.target.value })}
            />
          ) : (
            <span className={item.checked ? 'flex-1 text-zinc-400 line-through' : 'flex-1'}>
              {item.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
