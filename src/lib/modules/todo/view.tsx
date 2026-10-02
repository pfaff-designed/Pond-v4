'use client'

import { useState } from 'react'
import type { ModuleViewProps } from '../types'
import { POND_BLOCK_ROW_GAP, TODO_KIND } from '../block-frame'
import { todoMarker, type TodoBlock, type TodoItem } from './schema'
import { PondMolecule, type PondMoleculeState } from '@/components/molecules/PondMolecule'

/**
 * Todo view (#219) — the check row and the board's `list` block, COMPOSED from
 * `PondMolecule`'s `check-row` / `list-row`. The molecule already transcribes
 * `PondMolecule.dc.html`'s row — `display:flex; align-items:center; gap:10px;
 * width:360px; min-height:36px; padding:0 10px 0 4px; border-radius:10px;
 * font-size:13.5px` — with its handle (opacity 0 at rest, 1 on hover / dragging),
 * checkbox atom, date atom, done strike (ink .68, line at ink .4) and the hover /
 * dragging / editing / empty washes. None of that is restated here: this file owns
 * BEHAVIOUR (which row is hovered or under edit, what a toggle or a keystroke emits)
 * and the molecule owns every pixel. A state the row lacks is added there, never here.
 *
 * The marker picks the kind, from `PondTemplate.dc.html`'s `renderVals()`:
 *
 *   hasBox: k === 'check'              →  check  `check-row`
 *   hasDot: k === 'list' && !d.links   →  dot    `list-row`
 *   fontWeight: d.links ? 500 : 400    →  none   `list-row` · `dot={false}` · `emphasis`
 *
 * and the item's `meta` is the board's `b` column (`bStyle`: mono 10.5 / ink .68 /
 * nowrap), which the molecule draws as its `cellMeta` column only when non-empty
 * (`b: y || ''`) — see the molecule's `rowMeta` for why that register and not the
 * date atom (an ADR 0004 ruling, issue 219). The meta is passed as `''` when absent
 * on purpose: the molecule's `list-row` falls back to its mockup fixture (`today`)
 * for an undefined meta, and a fixture must never reach the product.
 *
 * `checked` is read only under the `check` marker. The field persists on every
 * item (the schema is one type), but a list has no box to have ticked, so a list
 * never strikes a row — switching a checklist's marker to `dot` is a change of
 * presentation, not a loss of data.
 *
 * The rows are the molecule's 360, as `PondBlock.dc.html` draws them inside the
 * 400 card (`hint: '360px,36px'`); `max-w-full` only keeps a narrow host (a diff
 * card, a preview) from overflowing, the way the frame clamps its notice. The stack
 * gap is the frame's own per-kind table, read through the SAME marker→kind map
 * `blockFrame()` uses (`TODO_KIND`), so the view and the card can never disagree.
 *
 * Editing folds into the view: the molecule's `onToggle` makes the box a real
 * `role="checkbox"` control and `onTitleChange` turns the title into a text field
 * wearing the title's own classes; every interaction emits the whole next block
 * through `onChange`. A focused field puts its row in the board's `editing` state
 * (the inset 1.4px ring). No add affordance is drawn here: the frame's empty state
 * (`add a step` / `add an item`) is the insert path, via `addTodoItem`. Row
 * reorder is not wired in this slice — the handle is the board's mark and the
 * molecule's `dragging` state exists for it; wiring it is a follow-up.
 */

/**
 * Append one unchecked, unlabelled item — the block's insert path (#239), pure,
 * through the same whole-block `onChange(nextBlock)` contract `patchItem` uses. The
 * frame's empty state is its one caller today. The marker rides through untouched,
 * so a `dot` list's `add an item` adds a list item (#239's rule: offered, never faked).
 */
export function addTodoItem(data: TodoBlock): TodoBlock {
  return {
    ...data,
    items: [...data.items, { id: crypto.randomUUID(), label: '', checked: false }],
  }
}

export function TodoView({ data, editable, onChange }: ModuleViewProps<TodoBlock>) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const marker = todoMarker(data)
  const check = marker === 'check'

  function patchItem(index: number, patch: Partial<TodoItem>) {
    onChange?.({
      ...data,
      items: data.items.map((it, k) => (k === index ? { ...it, ...patch } : it)),
    })
  }

  /**
   * The molecule state for one row — the host's one job. `editing` outranks
   * `hover`; `empty` is the molecule's own copy for a blank label and applies only
   * when there is no field to carry the placeholder.
   */
  function rowState(item: TodoItem): PondMoleculeState {
    if (editable && editing === item.id) return 'editing'
    if (hovered === item.id) return 'hover'
    if (!editable && item.label.trim() === '') return 'empty'
    return 'rest'
  }

  return (
    <div className={`flex flex-col ${POND_BLOCK_ROW_GAP[TODO_KIND[marker]]}`}>
      {data.items.map((item, j) => {
        const row = {
          state: rowState(item),
          title: item.label,
          meta: item.meta ?? '',
          className: 'max-w-full',
          onTitleChange: editable ? (label: string) => patchItem(j, { label }) : undefined,
        }
        return (
          // The wrapper carries the pointer/focus listeners the presentational
          // molecule does not own; `display: contents` keeps it out of the stack's
          // geometry so the molecule's row is the stack's direct flex item. Only
          // the text field's focus is `editing` — the checkbox control carries its
          // own focus ring and must not wash the row.
          <div
            key={item.id}
            className="contents"
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered((h) => (h === item.id ? null : h))}
            onFocus={(e) => e.target instanceof HTMLInputElement && setEditing(item.id)}
            onBlur={() => setEditing((e) => (e === item.id ? null : e))}
          >
            {check ? (
              <PondMolecule
                kind="check-row"
                {...row}
                on={item.checked}
                onToggle={editable ? () => patchItem(j, { checked: !item.checked }) : undefined}
              />
            ) : (
              <PondMolecule
                kind="list-row"
                {...row}
                dot={marker === 'dot'}
                emphasis={marker === 'none'}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
