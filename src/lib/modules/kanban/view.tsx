'use client'

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ModuleViewProps } from '../types'
import type { KanbanBlock } from './schema'
import { addCard, addColumn, moveCard, patchCard, removeCard, renameColumn } from './move'
import { MarkdownInline } from '@/components/atoms/Markdown'

/**
 * Kanban view (ticket-35). An interactive module like todo/table: editing is folded
 * into the view — drag a card between columns, add/edit/archive a card, add/rename a
 * column — so `kanban` declares no separate `editor`. Every interaction emits a whole
 * new block state via `onChange` (full-state, per the t12 contract).
 *
 * Visual language (w2-design-brief, Press aesthetic): columns are quiet paper wells
 * separated by hairlines, not heavy gray slabs; cards are small Press cards (title +
 * optional one-line note); the column header is kicker voice (small-caps, muted) + a
 * count. At the ~65ch editor width, 2–3 columns show with horizontal scroll.
 *
 * Drag (finding F4, no new dep — pointer events only): pressing a card past a small
 * threshold lifts it (soft shadow + slight tilt, reduced-motion guarded) and floats a
 * clone under the pointer; the column the pointer is over brightens its wash; release
 * drops the card to that column's foot via the pure `moveCard`. Within-column
 * reordering is out of scope (spec: drag BETWEEN columns).
 */

const DRAG_THRESHOLD = 4 // px before a press becomes a drag (vs. a click into a field)

interface DragState {
  cardId: string
  x: number
  y: number
  /** Grab offset so the floating clone tracks the pointer, not its top-left. */
  dx: number
  dy: number
  active: boolean // past threshold — the lift is showing
}

export function KanbanView({ data, editable, onChange }: ModuleViewProps<KanbanBlock>) {
  // Tolerate partially-parsed streamed data (like table/todo) rather than crash.
  const columns = data.columns ?? []

  const [drag, setDrag] = useState<DragState | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  const columnRefs = useRef(new Map<string, HTMLElement>())
  // The drag is driven ENTIRELY through refs, not state: pointerdown → move → up all
  // fire in one event burst with no re-render between, so a handler closing over
  // `drag`/`overColumn` STATE would read stale nulls. The refs are written and read
  // synchronously; `setDrag`/`setOverColumn` exist only to re-render the lift visuals.
  const dragRef = useRef<DragState | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const overColumnRef = useRef<string | null>(null)

  function emit(next: KanbanBlock) {
    onChange?.(next)
  }

  // ── Drag lifecycle (pointer events) ──────────────────────────────────────
  function onCardPointerDown(e: ReactPointerEvent, cardId: string) {
    if (!editable) return
    // Fired by the card's drag handle only (the body is edit inputs).
    // Offset from the whole card, so the floating clone tracks under the pointer.
    const rect = (
      (e.currentTarget as HTMLElement).closest('li') as HTMLElement
    ).getBoundingClientRect()
    startRef.current = { x: e.clientX, y: e.clientY }
    const next: DragState = {
      cardId,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      active: false,
    }
    dragRef.current = next
    setDrag(next)
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current
    if (!d || !startRef.current) return
    const moved =
      Math.abs(e.clientX - startRef.current.x) + Math.abs(e.clientY - startRef.current.y)
    const active = d.active || moved > DRAG_THRESHOLD
    const next: DragState = { ...d, x: e.clientX, y: e.clientY, active }
    dragRef.current = next
    setDrag(next)
    if (active) {
      const over = columnAt(e.clientX, e.clientY)
      overColumnRef.current = over
      setOverColumn(over)
    }
  }

  function onPointerUp() {
    const d = dragRef.current
    const over = overColumnRef.current
    if (d?.active && over) {
      emit(moveCard(data, d.cardId, over))
    }
    dragRef.current = null
    startRef.current = null
    overColumnRef.current = null
    setDrag(null)
    setOverColumn(null)
  }

  /** Hit-test the pointer against the column wells (no elementFromPoint — refs). */
  function columnAt(x: number, y: number): string | null {
    for (const [id, el] of columnRefs.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
    }
    return null
  }

  const draggingCard = drag?.active
    ? columns.flatMap((c) => c.cards).find((c) => c.id === drag.cardId)
    : undefined

  return (
    <div
      className="text-sm text-press-ink"
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? onPointerUp : undefined}
      // A pointer leaving the board mid-drag ends it cleanly (no orphaned lift).
      onPointerLeave={editable && drag ? onPointerUp : undefined}
    >
      {data.title && <div className="mb-2 text-press-muted">{data.title}</div>}

      <div className="flex gap-4 overflow-x-auto pb-1">
        {columns.map((col) => {
          const isOver = editable && drag?.active && overColumn === col.id
          return (
            <section
              key={col.id}
              ref={(el) => {
                if (el) columnRefs.current.set(col.id, el)
                else columnRefs.current.delete(col.id)
              }}
              className={[
                'min-w-[13rem] flex-1 rounded-md border px-3 py-2 transition-colors',
                isOver
                  ? 'border-press-accent bg-press-accent-wash'
                  : 'border-press-hair bg-press-card/40',
              ].join(' ')}
            >
              <header className="mb-2 flex items-baseline justify-between gap-2">
                {editable ? (
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[0.65rem] font-medium tracking-[0.14em] text-press-muted uppercase outline-none"
                    value={col.title}
                    aria-label={`Column title: ${col.title}`}
                    onChange={(e) => emit(renameColumn(data, col.id, e.target.value))}
                  />
                ) : (
                  <span className="text-[0.65rem] font-medium tracking-[0.14em] text-press-muted uppercase">
                    {col.title}
                  </span>
                )}
                <span className="text-[0.65rem] text-press-muted tabular-nums">
                  {col.cards.length}
                </span>
              </header>

              <ul className="space-y-2">
                {col.cards.length === 0 && (
                  <li className="py-1 text-xs text-press-muted/70">
                    {editable ? 'Drop or add a card' : 'Empty'}
                  </li>
                )}
                {col.cards.map((card) => {
                  const isDragging = drag?.active && drag.cardId === card.id
                  return (
                    <li
                      key={card.id}
                      className={[
                        'flex items-start gap-1.5 rounded-md border border-press-line bg-press-card px-2 py-2 shadow-sm',
                        // The lifted source card fades to a placeholder ghost.
                        isDragging ? 'opacity-30' : '',
                      ].join(' ')}
                    >
                      {editable && (
                        // Dedicated drag handle: the card body is full of edit inputs,
                        // so dragging lives on this grip (a11y: draggable via label).
                        <button
                          type="button"
                          aria-label={`Drag card: ${card.title || 'untitled'}`}
                          onPointerDown={(e) => onCardPointerDown(e, card.id)}
                          className="mt-0.5 cursor-grab touch-none leading-none text-press-muted/50 select-none hover:text-press-muted"
                        >
                          ⠿
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <CardBody
                          card={card}
                          editable={!!editable}
                          onTitle={(title) => emit(patchCard(data, card.id, { title }))}
                          onNote={(note) => emit(patchCard(data, card.id, { note }))}
                          onRemove={() => emit(removeCard(data, card.id))}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>

              {editable && (
                <AddCardFoot
                  onAdd={(title) => emit(addCard(data, col.id, { title }, crypto.randomUUID()))}
                />
              )}
            </section>
          )
        })}

        {editable && (
          <button
            type="button"
            className="min-w-[8rem] shrink-0 self-start rounded-md border border-dashed border-press-hair px-3 py-2 text-xs text-press-muted hover:text-press-ink"
            onClick={() => emit(addColumn(data, 'New column', crypto.randomUUID()))}
          >
            + Column
          </button>
        )}
      </div>

      {/* Floating clone that follows the pointer — the "lift" (soft shadow + tilt). */}
      {draggingCard && drag && (
        <div
          className="pointer-events-none fixed z-50 w-52 rotate-2 rounded-md border border-press-line bg-press-card px-2.5 py-2 shadow-lg motion-reduce:rotate-0"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          aria-hidden
        >
          <div className="font-medium text-press-ink">{draggingCard.title}</div>
          {draggingCard.note && (
            <div className="mt-0.5 text-xs text-press-muted">{draggingCard.note}</div>
          )}
        </div>
      )}
    </div>
  )
}

/** One card's editable/read-only body — title (+ optional note), remove affordance. */
function CardBody({
  card,
  editable,
  onTitle,
  onNote,
  onRemove,
}: {
  card: { title: string; note?: string }
  editable: boolean
  onTitle: (v: string) => void
  onNote: (v: string) => void
  onRemove: () => void
}) {
  if (!editable) {
    return (
      <>
        <MarkdownInline className="font-medium">{card.title}</MarkdownInline>
        {card.note && (
          <MarkdownInline className="mt-0.5 block text-xs text-press-muted">
            {card.note}
          </MarkdownInline>
        )}
      </>
    )
  }
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <input
          className="w-full bg-transparent font-medium outline-none"
          value={card.title}
          aria-label={`Card title: ${card.title || 'untitled'}`}
          onChange={(e) => onTitle(e.target.value)}
        />
        <input
          className="mt-0.5 w-full bg-transparent text-xs text-press-muted outline-none"
          value={card.note ?? ''}
          placeholder="Add a note…"
          aria-label={`Card note: ${card.title || 'untitled'}`}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>
      <button
        type="button"
        aria-label={`Archive card: ${card.title || 'untitled'}`}
        className="text-press-muted/60 hover:text-press-rust"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

/** Quiet add-card affordance at the column foot: a field that commits on Enter/blur. */
function AddCardFoot({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState('')
  function commit() {
    const title = value.trim()
    if (!title) return
    onAdd(title)
    setValue('')
  }
  return (
    <input
      className="mt-2 w-full rounded-md bg-transparent px-2.5 py-1.5 text-xs text-press-muted outline-none placeholder:text-press-muted/60 hover:bg-press-accent-wash focus:bg-press-accent-wash focus:text-press-ink"
      value={value}
      placeholder="+ Add card"
      aria-label="Add a card"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      onBlur={commit}
    />
  )
}
