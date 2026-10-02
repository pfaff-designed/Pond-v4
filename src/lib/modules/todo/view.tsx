'use client'

import { useState } from 'react'
import type { ModuleViewProps } from '../types'
import { POND_BLOCK_ROW_GAP, TODO_KIND, TODO_ROW } from '../block-frame'
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
 * The marker picks the row through `TODO_ROW` in `block-frame.ts` — an exhaustive
 * `Record<TodoMarker, …>` beside `TODO_KIND`, so a fourth marker is a compile error
 * there rather than a bare `list-row` here. Its rows are `PondTemplate.dc.html`'s
 * `renderVals()`:
 *
 *   hasBox: k === 'check'              →  check  `check-row`
 *   hasDot: k === 'list' && !d.links   →  dot    `list-row`
 *   fontWeight: d.links ? 500 : 400    →  none   `list-row` · `dot={false}` · `emphasis`
 *
 * The item's `meta` is the board's `b` column, drawn by the molecule as the DATE
 * ATOM — `PondMolecule.dc.html`'s `list-row` imports `PondAtom kind="date"` for it,
 * and `PondAtom.dc.html` gives `date` the base text style (sans 13.5 / 400 / full
 * ink / nowrap) plus the burnt-orange due dot — only when non-empty (`b: y || ''`).
 * `PondTemplate.dc.html`'s mono-10.5 `bStyle` is a level-4 layout's own tighter
 * rendering of the same content and stays unreconciled, like the card padding; see
 * the molecule's `metaAtom` for the measurement. The meta is passed as `''` when
 * absent on purpose: the molecule's `list-row` falls back to its mockup fixture
 * (`today`) for an undefined meta, and a fixture must never reach the product.
 * `todoItemSchema` has no `due` field and none is passed, so the dot lights only on
 * a `list-row` whose meta is literally `today` — the board's own rule.
 *
 * `checked` is read only under the `check` marker. The field persists on every
 * item (the schema is one type), but a list has no box to have ticked, so a list
 * never strikes a row — switching a checklist's marker to `dot` is a change of
 * presentation, not a loss of data.
 *
 * Labels are PLAIN TEXT (a decision, not an omission): before #219 a read-only
 * label went through `MarkdownInline`, so `**item**` read bold. The molecule's
 * `title` is a `string` — a ReactNode slot would be a new molecule capability — and
 * the board draws plain text in the row, so asterisks now show literally. `table`'s
 * cells still render through `MarkdownInline`; the two row modules disagree here on
 * purpose, and this line is the record of it.
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
 * reorder is not wired in this slice — the handle is what the board draws on hover,
 * so it stays drawn; wiring it is #266.
 *
 * Retired with the bare `<input>` it was attached to: ticket-41's `motion-check`
 * settle beat (a hair over-scale back to rest on check). It predates the handoff
 * and no board specifies a checkbox beat. If one ever does, it belongs on
 * `PondAtom kind="checkbox"` — the one owner of the box — not on a module view, so
 * nothing re-attaches it here and nothing replaces it.
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
  const spec = TODO_ROW[marker]

  function patchItem(index: number, patch: Partial<TodoItem>) {
    onChange?.({
      ...data,
      items: data.items.map((it, k) => (k === index ? { ...it, ...patch } : it)),
    })
  }

  /**
   * The molecule state for one row — the host's one job. `editing` outranks
   * everything. `empty` — the molecule's own copy for a blank label, applicable only
   * when there is no field to carry the placeholder — is tested BEFORE `hover`: the
   * board models hover and empty as independent states, not a precedence, and the
   * molecule only reaches its empty copy under `state === 'empty'` (`title` is `''`,
   * not nullish, so the fixture fallback does not fire either). Hover first would
   * blank a read-only blank row under the pointer.
   */
  function rowState(item: TodoItem): PondMoleculeState {
    if (editable && editing === item.id) return 'editing'
    if (!editable && item.label.trim() === '') return 'empty'
    if (hovered === item.id) return 'hover'
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
            {spec.row === 'check-row' ? (
              <PondMolecule
                kind="check-row"
                {...row}
                on={item.checked}
                onToggle={editable ? () => patchItem(j, { checked: !item.checked }) : undefined}
              />
            ) : (
              <PondMolecule kind="list-row" {...row} dot={spec.dot} emphasis={spec.emphasis} />
            )}
          </div>
        )
      })}
    </div>
  )
}
