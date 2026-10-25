'use client'

import { useEffect, useRef, useState } from 'react'
import type { ModuleViewProps } from '../types'
import { blockEmptyCopy, blockFrame, POND_BLOCK_ROW_GAP, TODO_KIND, TODO_ROW } from '../block-frame'
import { todoMarker, type TodoBlock, type TodoItem } from './schema'
import { PondMolecule, type PondMoleculeState } from '@/components/molecules/PondMolecule'
import { useBlockRow } from '../block-row-context'
import { useSiblingBlocks } from '../sibling-context'
import { SESSION_UNDO_SCOPE_ATTR } from '@/lib/shell-commands'
import { useAcceptMarks } from '@/lib/change-log/accept-marks'
import { markTarget } from '@/lib/change-log/accept-marks-diff'
import { formatChangedLabel } from '@/lib/change-log/changed-mark'

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
 * wearing the title's own classes; a toggle or a label edit emits the whole next
 * block through `onChange`, the ordinary debounced save. A STRUCTURAL edit — add,
 * remove, move, reorder (KAN-355) — emits through `useBlockRow().commitStep`
 * instead, so it lands as its own save/change-log record rather than merging into
 * whatever else lands inside the same 600ms pause; `⌘Z` then undoes it as its own
 * step. Outside a `BlockCanvas` host (no `BlockRowProvider` above this view —
 * `page/view.tsx`, a Storybook host) `commitStep` is absent, and the same
 * structural edit falls back to this view's own `onChange` rather than being
 * silently dropped. A focused field puts its row in the board's `editing` state
 * (the inset 1.4px ring). The molecule's ⋮⋮ handle (KAN-355) is wired from the
 * per-item wrapper below, not the molecule itself: a press that did not start
 * on the handle stays non-draggable, so the text field keeps native text
 * selection.
 *
 * Retired with the bare `<input>` it was attached to: ticket-41's `motion-check`
 * settle beat (a hair over-scale back to rest on check). It predates the handoff
 * and no board specifies a checkbox beat. If one ever does, it belongs on
 * `PondAtom kind="checkbox"` — the one owner of the box — not on a module view, so
 * nothing re-attaches it here and nothing replaces it.
 */

/**
 * Insert one unchecked, unlabelled item — the block's one insert path (#239,
 * generalised KAN-355), pure, through the same whole-block `onChange(nextBlock)`
 * contract `patchItem` uses. `afterIndex` undefined appends (the frame's empty
 * state and a last-item Enter both still want this); a number inserts directly
 * after that index (a middle-item Enter). The marker rides through untouched,
 * so a `dot` list's `add an item` adds a list item (#239's rule: offered, never
 * faked).
 */
export function addTodoItem(data: TodoBlock, afterIndex?: number): TodoBlock {
  const item: TodoItem = { id: crypto.randomUUID(), label: '', checked: false }
  const at = afterIndex === undefined ? data.items.length : afterIndex + 1
  const items = [...data.items]
  items.splice(at, 0, item)
  return { ...data, items }
}

/**
 * The item drag's own cargo (KAN-355 fix): a block drag or a foreign drop
 * carries no data under this key, so `onDragOver`/`dropItem` below can tell
 * an item's own drag from one that merely crosses the list — `Number(getData
 * ('text/plain'))` used to read `0` for both and move item 0 on either.
 */
const ITEM_DRAG_MIME = 'application/x-pond-item'

interface ItemDragPayload {
  blockId: string
  index: number
}

/**
 * The in-flight drag's own source (KAN-355 fix), module-level because
 * `dataTransfer.getData` only resolves on `dragstart`/`drop` — `dragover`
 * sees `types` but never the payload, so a list whose block this drag did
 * NOT start from would otherwise show its own drop-bar for someone else's
 * item, and `onDragOver`'s own-row/no-op guard would have nothing but the
 * (unreliable, see below) `armedIndex` to compare against. Set on
 * `dragstart`, cleared on `dragend` — the only two events a real drag
 * guarantees, unlike `pointercancel`/`pointerleave`, which Chrome fires on
 * the source right after `dragstart` and would otherwise race `armedIndex`
 * back to `null` before the first `dragover`.
 */
let dragging: { blockId: string; index: number } | null = null

type DropZone = 'above' | 'below'

/**
 * The drawn bar's side (KAN-355): which half of the hovered row the pointer
 * is over. The one computation `onDragOver` and `onDrop` must agree on —
 * reading it from component state instead let a drop resolve a different
 * zone than the bar it had just shown.
 */
function zoneOf(e: React.DragEvent<HTMLDivElement>): DropZone {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
}

/**
 * The index a drop at `target`'s `zone` lands the item FROM `from` at, once
 * `from` itself is spliced out first — a drop drawn 'above' row 2 means
 * "land directly before row 2", not "insert at array index 2 before removal".
 * Removing an earlier item shifts every later index down by one, so an
 * 'above'/'below' target past the source is corrected by one (BlockCanvas's
 * `commitOwnLineDrop` does the same subtraction for its own rows). Hovering
 * the dragged item's own row, or a position that reproduces the current
 * order, always resolves back to `from` — the caller's own-row/no-op check.
 */
function resolveDropIndex(from: number, target: number, zone: DropZone): number {
  const insertAt = zone === 'above' ? target : target + 1
  return from < insertAt ? insertAt - 1 : insertAt
}

export function TodoView({ data, editable, onChange }: ModuleViewProps<TodoBlock>) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [armedIndex, setArmedIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; zone: DropZone } | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<{ id: string; caret: 'start' | 'end' | number } | null>(null)
  const marker = todoMarker(data)
  const spec = TODO_ROW[marker]
  const { stepOut, commitStep } = useBlockRow()
  // No `BlockRowProvider` above this view (page/view.tsx, a Storybook host) —
  // KAN-355's save-flush has nothing to flush, so a structural edit falls
  // back to the view's own `onChange` rather than the context's absent default.
  const commit = (patch: TodoBlock) => (commitStep ?? onChange)?.(patch)

  // KAN-143's accept marks, read by target string (`block-frame.ts`'s own
  // `useSiblingBlocks().pageId` — absent outside a page host, e.g. Storybook;
  // the empty-string pageId then simply has no marks). A row's own mark wins;
  // a block-level mark (no row touched its own fields) shows once, on the
  // first row, never per item — the mark names the WHOLE row's value, not
  // every item's. `hasRenderedRowMark` only counts a row mark against an id
  // IN `data.items` right now — a removed row's own mark is still in
  // `acceptMarks` (the store never drops it) but has no row left to carry
  // it, so it must not suppress the block-level fallback (a delete-only
  // accept would otherwise show nothing at all). That orphaned row mark is
  // also the fallback's own SOURCE when there is no `block:<id>` entry
  // (`touchedMarks` emits only row targets for a pure item delete) — it
  // still names "this block changed", just at the row's own id.
  const { pageId } = useSiblingBlocks()
  const acceptMarks = useAcceptMarks(pageId ?? '')
  const blockTarget = markTarget(data.id)
  const rowMarkPrefix = `${blockTarget}:row:`
  const hasRenderedRowMark = data.items.some((item) =>
    acceptMarks.some((mark) => mark.target === markTarget(data.id, item.id))
  )
  const blockMark =
    acceptMarks.find((mark) => mark.target === blockTarget) ??
    (hasRenderedRowMark
      ? undefined
      : acceptMarks.find((mark) => mark.target.startsWith(rowMarkPrefix)))
  function changedLabelFor(item: TodoItem, index: number): string | undefined {
    const rowMark = acceptMarks.find((mark) => mark.target === markTarget(data.id, item.id))
    const mark = rowMark ?? (!hasRenderedRowMark && index === 0 ? blockMark : undefined)
    return mark && formatChangedLabel(mark.acceptedAt)
  }

  function patchItem(index: number, patch: Partial<TodoItem>) {
    onChange?.({
      ...data,
      items: data.items.map((it, k) => (k === index ? { ...it, ...patch } : it)),
    })
  }

  // The dragged item's source rides in `dataTransfer` under the private MIME
  // above, not component state — the drag can cross a re-render (and
  // `armedIndex` is cleared on drop/dragend regardless of which row receives
  // the drop). A block drag or a foreign drop carries no such data, rides
  // under another block's id, or names an index this list doesn't have
  // (KAN-355 fix): any of those is left untouched and unprevented so the
  // event still reaches `BlockCanvas`'s own row handler. `zone` is the drawn
  // bar's own side (KAN-355 fix) — committing straight to `target` landed the
  // item one row below the line on every downward drag.
  function dropItem(target: number, zone: DropZone, e: React.DragEvent<HTMLDivElement>) {
    const raw = e.dataTransfer.getData(ITEM_DRAG_MIME)
    if (!raw) return
    let payload: ItemDragPayload
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }
    if (payload.blockId !== data.id) return
    if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= data.items.length)
      return
    e.preventDefault()
    e.stopPropagation()
    const insertAt = resolveDropIndex(payload.index, target, zone)
    if (insertAt === payload.index) return
    const items = [...data.items]
    const [moved] = items.splice(payload.index, 1)
    items.splice(insertAt, 0, moved)
    commit({ ...data, items })
  }

  // Disarming the handle only on `pointerup`/`dragend` (KAN-355 fix): a
  // press released off the row never reaches that row's own `onPointerUp`,
  // so the arm would otherwise stick. `pointercancel`/`pointerleave` are NOT
  // disarm events here — Chrome fires both on the drag's source element
  // right after `dragstart`, which used to clear `armedIndex` before the
  // drag's own first `dragover`.
  useEffect(() => {
    if (!editable || armedIndex === null) return
    const disarm = () => setArmedIndex(null)
    window.addEventListener('pointerup', disarm)
    return () => window.removeEventListener('pointerup', disarm)
  }, [editable, armedIndex])

  // A newly-focused item exists only after the `onChange` above commits and
  // this re-renders with it; a `.focus()` call made inline in the key handler
  // would still be targeting last render's (nonexistent) input.
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const input = rowsRef.current?.querySelector<HTMLInputElement>(
      `[data-item-id="${pending.id}"] input`
    )
    input?.focus()
    const caret =
      typeof pending.caret === 'number'
        ? pending.caret
        : pending.caret === 'end'
          ? (input?.value.length ?? 0)
          : 0
    input?.setSelectionRange(caret, caret)
    pendingFocus.current = null
  }, [data.items])

  /**
   * Return on the LAST item with an empty label leaves the list — the empty
   * item is removed and the row steps out through its existing
   * `insertLineAfter`, no second insert path, the removal riding along AS
   * `stepOut`'s own patch in the one call (a separate `onChange` here would
   * rebuild from the pre-patch block array and silently undo it). Every other
   * Enter splits the item AT THE CARET (KAN-355): the label after
   * `selectionStart` moves into a new item inserted directly below, the
   * current item keeps the text before the caret, and focus moves to the
   * new item's start. A caret at the end (typing, then Enter) leaves the
   * current item's text whole and the new item empty — the only behaviour
   * the LAST item had before the split landed.
   *
   * Backspace on an empty item removes it (KAN-355): the caret in an empty
   * field has nowhere else to be, so `label === ''` is already "at the
   * start". Removing the FIRST item moves focus to the item now at index 0
   * (there is no previous item to land on); removing the only item leaves
   * `items: []`, which is `blockIsEmpty`'s own rule — the frame swaps to
   * `PondBlockEmpty` and no further handling belongs here.
   *
   * Backspace at offset 0 of a NON-empty item joins its label onto the end
   * of the previous item (KAN-355) and removes it, caret landing at the join
   * (the previous item's un-joined length) — not at the combined string's
   * end. On the first item there is no previous item to join into, so it is
   * a no-op.
   *
   * ⌥↑/⌥↓ swaps the item with its neighbour (KAN-355) and stops propagation:
   * `BlockCanvas.tsx` reorders the whole block on the same chord with no
   * `e.target === e.currentTarget` guard, so an unstopped event would also
   * fire there. The row's `key={item.id}` keeps the same input DOM node
   * across the swap, so focus and caret need no explicit restore.
   *
   * Tab/⇧Tab is a no-op (KAN-355, user ruling): lists stay flat, so there is
   * no indent to apply and no next field to move to — just hold the caret.
   *
   * Plain ↑/↓ (no modifier — ⌥↑/⌥↓ is the reorder above) moves the caret to
   * the same offset, clamped, in the previous/next item's field (KAN-355).
   * At the first/last item it is left alone: no items change, so there is
   * no `onChange` to ride the focus effect on — the input is focused
   * directly.
   */
  function handleItemKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    // An IME commit fires Enter/Backspace to close its own composition, not to
    // split or remove an item — same guard as draft-input.tsx.
    if (e.nativeEvent.isComposing && (e.key === 'Enter' || e.key === 'Backspace')) return
    // Lists stay flat (user ruling, KAN-355): Tab/⇧Tab must not indent or
    // leave the item, so the caret stays exactly where it is.
    if (e.key === 'Tab') {
      e.preventDefault()
      return
    }
    if (e.key === 'Backspace' && data.items[index].label === '') {
      e.preventDefault()
      const items = data.items.filter((_, k) => k !== index)
      if (index > 0) {
        pendingFocus.current = { id: data.items[index - 1].id, caret: 'end' }
      } else if (items.length > 0) {
        pendingFocus.current = { id: items[0].id, caret: 'start' }
      }
      commit({ ...data, items })
      return
    }
    if (
      e.key === 'Backspace' &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      if (index === 0) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      const prev = data.items[index - 1]
      const joinAt = prev.label.length
      const joined = prev.label + data.items[index].label
      const items = data.items
        .map((it, k) => (k === index - 1 ? { ...it, label: joined } : it))
        .filter((_, k) => k !== index)
      pendingFocus.current = { id: prev.id, caret: joinAt }
      commit({ ...data, items })
      return
    }
    if (
      e.altKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      e.stopPropagation()
      const target = index + (e.key === 'ArrowUp' ? -1 : 1)
      if (target < 0 || target >= data.items.length) return
      const items = [...data.items]
      ;[items[index], items[target]] = [items[target], items[index]]
      commit({ ...data, items })
      return
    }
    if (
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      !e.altKey &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      const target = index + (e.key === 'ArrowUp' ? -1 : 1)
      if (target < 0 || target >= data.items.length) return
      e.preventDefault()
      const caret = Math.min(e.currentTarget.selectionStart ?? 0, data.items[target].label.length)
      const input = rowsRef.current?.querySelector<HTMLInputElement>(
        `[data-item-id="${data.items[target].id}"] input`
      )
      input?.focus()
      input?.setSelectionRange(caret, caret)
      return
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    if (index === data.items.length - 1 && data.items[index].label.trim() === '') {
      stepOut({ ...data, items: data.items.slice(0, index) })
      return
    }
    const label = data.items[index].label
    const caret = e.currentTarget.selectionStart ?? label.length
    const before = label.slice(0, caret)
    const after = label.slice(caret)
    const split = data.items.map((it, k) => (k === index ? { ...it, label: before } : it))
    const next = addTodoItem({ ...data, items: split }, index)
    const items = next.items.map((it, k) => (k === index + 1 ? { ...it, label: after } : it))
    pendingFocus.current = { id: items[index + 1].id, caret: 'start' }
    commit({ ...next, items })
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
    <div
      ref={rowsRef}
      {...{ [SESSION_UNDO_SCOPE_ATTR]: '' }}
      className={`flex flex-col ${POND_BLOCK_ROW_GAP[TODO_KIND[marker]]}`}
      onDragLeave={
        editable
          ? (e) => {
              // Only clears leaving the LIST, not a hop between two of its
              // own rows — `relatedTarget` is still inside `rowsRef` then.
              if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))
                return
              setDropTarget(null)
            }
          : undefined
      }
    >
      {data.items.map((item, j) => {
        const row = {
          state: rowState(item),
          title: item.label,
          placeholder: item.placeholder,
          meta: item.meta ?? '',
          changedLabel: changedLabelFor(item, j),
          className: 'max-w-full',
          onTitleChange: editable ? (label: string) => patchItem(j, { label }) : undefined,
          onTitleKeyDown: editable
            ? (e: React.KeyboardEvent<HTMLInputElement>) => handleItemKeyDown(j, e)
            : undefined,
        }
        return (
          // The wrapper carries the pointer/focus listeners the presentational
          // molecule does not own. It is a real box, not `display: contents`
          // (KAN-355 fix): Chrome does not reliably drag a `display: contents`
          // source, and `self-start` keeps it from stretching to the stack's
          // cross axis, so the drawn row's own 360/330px width is unchanged.
          // Every drag handler stops propagation so an item drag is never ALSO
          // read as the whole-block drag `BlockCanvas`'s row carries on the
          // same four events; `onDragOver`/`dropItem` additionally gate on the
          // private MIME above, so a block drag or a foreign drop passes
          // through untouched rather than being swallowed here. Only the text
          // field's focus is `editing` — the checkbox control carries its own
          // focus ring and must not wash the row.
          <div
            key={item.id}
            data-item-id={item.id}
            className="relative self-start"
            draggable={editable && armedIndex === j}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered((h) => (h === item.id ? null : h))}
            onFocus={(e) => e.target instanceof HTMLInputElement && setEditing(item.id)}
            onBlur={() => setEditing((e) => (e === item.id ? null : e))}
            onPointerDown={
              editable
                ? (e) => {
                    if ((e.target as Element).closest('[data-part="handle"]')) setArmedIndex(j)
                  }
                : undefined
            }
            onPointerUp={editable ? () => setArmedIndex(null) : undefined}
            onDragStart={
              editable
                ? (e) => {
                    e.stopPropagation()
                    dragging = { blockId: data.id, index: j }
                    e.dataTransfer.setData(
                      ITEM_DRAG_MIME,
                      JSON.stringify({ blockId: data.id, index: j } satisfies ItemDragPayload)
                    )
                  }
                : undefined
            }
            onDragEnd={
              editable
                ? (e) => {
                    e.stopPropagation()
                    dragging = null
                    setArmedIndex(null)
                    setDropTarget(null)
                  }
                : undefined
            }
            onDragOver={
              editable
                ? (e) => {
                    if (!e.dataTransfer.types.includes(ITEM_DRAG_MIME)) return
                    // An item dragging over SOME list, but not the one it
                    // started from, reads `types` the same either way — only
                    // the module-level drag source (set on `dragstart`,
                    // since `getData` is unreadable here) tells the two
                    // apart (KAN-355 fix). Leave it unprevented so a foreign
                    // drag still reaches whichever row actually owns it.
                    if (dragging?.blockId !== data.id) return
                    e.preventDefault()
                    e.stopPropagation()
                    const zone = zoneOf(e)
                    // Own row, or a position that reproduces the current
                    // order, draws no bar (KAN-355 fix): `resolveDropIndex`
                    // collapses back to `dragging.index` in both cases. Read
                    // from `dragging`, not `armedIndex` — Chrome clears the
                    // latter (via `pointercancel`/`pointerleave`) before the
                    // drag's own first `dragover`, which used to leave no
                    // own-row guard at all.
                    if (resolveDropIndex(dragging.index, j, zone) === dragging.index) {
                      setDropTarget(null)
                      return
                    }
                    setDropTarget({ index: j, zone })
                  }
                : undefined
            }
            onDrop={
              editable
                ? (e) => {
                    // The zone is recomputed from the drop's OWN pointer
                    // position, never read back off `dropTarget` (KAN-355
                    // fix): `dragOver` sets that state to `null` for a
                    // no-op position, and reading a stale/absent value here
                    // used to fall back to `'below'` — landing the item on
                    // the wrong side of a no-op release instead of leaving
                    // it alone.
                    dropItem(j, zoneOf(e), e)
                    setDropTarget(null)
                  }
                : undefined
            }
          >
            {/* The drop line (KAN-355, `PondBlock.dc.html`'s `dropBar`, `above`/
                `below`): 2px, ink, radius 1, 9px off the row's top or bottom
                edge, picked by which half of the row the pointer is over — the
                side the item lands on, not always the row's top. */}
            {dropTarget?.index === j && (
              <span
                data-part="drop-bar"
                className="pointer-events-none absolute rounded-[1px] bg-mn-text"
                style={
                  dropTarget.zone === 'above'
                    ? { top: -9, left: 0, right: 0, height: 2 }
                    : { bottom: -9, left: 0, right: 0, height: 2 }
                }
              />
            )}
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
      {editable && data.items.length > 0 && (
        <button
          type="button"
          className="font-mono lowercase text-[10.5px] text-mn-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          onClick={() => {
            const next = addTodoItem(data)
            pendingFocus.current = { id: next.items[next.items.length - 1].id, caret: 'start' }
            commit(next)
          }}
        >
          ＋ {blockEmptyCopy(blockFrame(data)!.kind).action}
        </button>
      )}
    </div>
  )
}
