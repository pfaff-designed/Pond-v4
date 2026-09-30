'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ModuleViewProps } from '../types'
import type { KanbanBlock } from './schema'
import { addCard, addColumn, moveCard, patchCard, removeCard, renameColumn } from './move'
import { MarkdownInline } from '@/components/atoms/Markdown'
import { usePageLinks } from '../page-link/context'
import type { PageLinkCapabilities, PageRef } from '../page-link/context'

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
 *
 * F27 — card→page links: a card may hold an optional `pageId`. When set, the linked
 * page is the source of truth for the card's title (the stored `title` is a
 * denormalized cache), a click navigates to it, and a card menu mints/links/unlinks.
 * These capabilities arrive via `usePageLinks()` (host context); when absent (AI
 * terminal reference render, Storybook) the view degrades to plain cards.
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

/** Per-card link status, resolved against the host's pages cache. */
type LinkState = { kind: 'none' } | { kind: 'linked'; ref: PageRef } | { kind: 'missing' } // pageId set but the page is gone (orphaned)

function cardLinkState(pageId: string | undefined, links: PageLinkCapabilities | null): LinkState {
  if (!pageId) return { kind: 'none' }
  const ref = links?.resolvePage(pageId)
  return ref ? { kind: 'linked', ref } : { kind: 'missing' }
}

export function KanbanView({ data, editable, onChange }: ModuleViewProps<KanbanBlock>) {
  // Tolerate partially-parsed streamed data (like table/todo) rather than crash.
  const columns = data.columns ?? []
  const links = usePageLinks()

  const [drag, setDrag] = useState<DragState | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  // Which card's link menu is open (only one at a time).
  const [menuCard, setMenuCard] = useState<string | null>(null)
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

  // ── F27 link actions ──────────────────────────────────────────────────────
  async function createAndLink(cardId: string, currentTitle: string) {
    if (!links) return
    const ref = await links.createLinkedPage(currentTitle)
    // Adopt the page's title as the card's cache so the two start in sync.
    emit(patchCard(data, cardId, { pageId: ref.id, title: ref.title }))
    setMenuCard(null)
  }
  function linkExisting(cardId: string, ref: PageRef) {
    emit(patchCard(data, cardId, { pageId: ref.id, title: ref.title }))
    setMenuCard(null)
  }
  function unlink(cardId: string) {
    // Setting pageId undefined drops it on serialize — the card reverts to free-text,
    // keeping its last (cached) title.
    emit(patchCard(data, cardId, { pageId: undefined }))
    setMenuCard(null)
  }
  function openLink(ref: PageRef) {
    links?.navigateToPage(ref)
    setMenuCard(null)
  }
  // Write-through: on blur/enter of a linked card's title, rename the page (source of
  // truth). Fires on commit, not per keystroke, to avoid a write per character.
  function commitLinkedTitle(pageId: string, title: string) {
    void links?.renamePage(pageId, title)
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
      className="text-sm text-mn-text"
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? onPointerUp : undefined}
      // A pointer leaving the board mid-drag ends it cleanly (no orphaned lift).
      onPointerLeave={editable && drag ? onPointerUp : undefined}
    >
      {data.title && <div className="mb-2 text-mn-text-secondary">{data.title}</div>}

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
                'min-w-[13rem] flex-1 rounded-mn-inner px-3 py-2 transition-[background-color,box-shadow]',
                isOver
                  ? 'bg-mn-wash shadow-mn-md'
                  : 'bg-mn-card/40 shadow-mn-sm',
              ].join(' ')}
            >
              <header className="mb-2 flex items-baseline justify-between gap-2">
                {editable ? (
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[0.65rem] font-medium tracking-[0.14em] text-mn-text-secondary uppercase outline-none"
                    value={col.title}
                    aria-label={`Column title: ${col.title}`}
                    onChange={(e) => emit(renameColumn(data, col.id, e.target.value))}
                  />
                ) : (
                  <span className="text-[0.65rem] font-medium tracking-[0.14em] text-mn-text-secondary uppercase">
                    {col.title}
                  </span>
                )}
                <span className="text-[0.65rem] text-mn-text-secondary tabular-nums">
                  {col.cards.length}
                </span>
              </header>

              <ul className="space-y-2">
                {col.cards.length === 0 && (
                  <li className="py-1 text-xs text-mn-text-secondary/70">
                    {editable ? 'Drop or add a card' : 'Empty'}
                  </li>
                )}
                {col.cards.map((card) => {
                  const isDragging = drag?.active && drag.cardId === card.id
                  const link = cardLinkState(card.pageId, links)
                  return (
                    <li
                      key={card.id}
                      className={[
                        'relative flex items-start gap-1.5 rounded-mn-row bg-mn-card px-2 py-2 shadow-mn-sm',
                        // ticket-41: a quiet hover raise (shadow only — the card is
                        // a drag object, not a click target, so it lifts rather than
                        // presses). Token-timed, reduced-motion drops the travel.
                        'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-mn)] hover:shadow-mn-md motion-reduce:transition-none',
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
                          className="mt-0.5 cursor-grab touch-none leading-none text-mn-text-secondary/50 select-none hover:text-mn-text-secondary"
                        >
                          ⠿
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <CardBody
                          card={card}
                          editable={!!editable}
                          link={link}
                          canLink={!!links}
                          onTitle={(title) => emit(patchCard(data, card.id, { title }))}
                          onTitleCommit={(title) => {
                            // Take the live input value (not the render-closure cache,
                            // which lags a paste-then-blur) so the page is renamed to
                            // exactly what the field shows.
                            if (card.pageId) commitLinkedTitle(card.pageId, title)
                          }}
                          onNote={(note) => emit(patchCard(data, card.id, { note }))}
                          onRemove={() => emit(removeCard(data, card.id))}
                          onOpen={link.kind === 'linked' ? () => openLink(link.ref) : undefined}
                          onToggleMenu={
                            editable && links
                              ? () => setMenuCard((c) => (c === card.id ? null : card.id))
                              : undefined
                          }
                        />
                      </div>

                      {/* Link menu — mint / link-existing / open / unlink. */}
                      {editable && links && menuCard === card.id && (
                        <CardLinkMenu
                          links={links}
                          link={link}
                          onOpen={() => link.kind === 'linked' && openLink(link.ref)}
                          onCreate={() => createAndLink(card.id, card.title)}
                          onPick={(ref) => linkExisting(card.id, ref)}
                          onUnlink={() => unlink(card.id)}
                          onClose={() => setMenuCard(null)}
                        />
                      )}
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
            className="min-w-[8rem] shrink-0 self-start rounded-mn-inner border border-dashed border-mn-hair px-3 py-2 text-xs text-mn-text-secondary hover:text-mn-text"
            onClick={() => emit(addColumn(data, 'New column', crypto.randomUUID()))}
          >
            + Column
          </button>
        )}
      </div>

      {/* Floating clone that follows the pointer — the "lift" (soft shadow + tilt). */}
      {draggingCard && drag && (
        <div
          className="pointer-events-none fixed z-50 w-52 rotate-2 rounded-mn-row bg-mn-card px-2.5 py-2 shadow-mn-lg motion-reduce:rotate-0"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          aria-hidden
        >
          <div className="font-medium text-mn-text">{draggingCard.title}</div>
          {draggingCard.note && (
            <div className="mt-0.5 text-xs text-mn-text-secondary">{draggingCard.note}</div>
          )}
        </div>
      )}
    </div>
  )
}

/** A quiet inline glyph marking a linked (↗) or orphaned (missing) card. */
function LinkGlyph({ link }: { link: LinkState }) {
  if (link.kind === 'linked') {
    return (
      <span
        className="shrink-0 text-mn-text/70 select-none"
        aria-hidden
        title="Linked to a page"
      >
        ↗
      </span>
    )
  }
  if (link.kind === 'missing') {
    return (
      <span
        className="shrink-0 text-[0.65rem] text-mn-text-secondary/70 italic select-none"
        title="Linked page is missing"
      >
        missing
      </span>
    )
  }
  return null
}

/**
 * One card's editable/read-only body — title (+ optional note), link affordances,
 * and (when linkable) the archive + link-menu controls.
 *
 * A linked card in READ-ONLY mode renders its title as a navigating button; in
 * EDITABLE mode the title input's blur writes through to the page (`onTitleCommit`).
 * The stored `card.title` is the input's live value so typing stays responsive; the
 * page is reconciled as the source of truth on commit.
 */
function CardBody({
  card,
  editable,
  link,
  canLink,
  onTitle,
  onTitleCommit,
  onNote,
  onRemove,
  onOpen,
  onToggleMenu,
}: {
  card: { title: string; note?: string; pageId?: string }
  editable: boolean
  link: LinkState
  canLink: boolean
  onTitle: (v: string) => void
  onTitleCommit: (title: string) => void
  onNote: (v: string) => void
  onRemove: () => void
  onOpen?: () => void
  onToggleMenu?: () => void
}) {
  if (!editable) {
    // Read-only (AI terminal reference). A resolved link navigates on click; an
    // orphan shows its cached title with a quiet "missing" marker.
    const titleNode =
      link.kind === 'linked' && onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-medium text-mn-text underline decoration-mn-text/30 underline-offset-2 hover:decoration-mn-text"
        >
          {link.ref.title}
        </button>
      ) : (
        <MarkdownInline className="font-medium">{card.title}</MarkdownInline>
      )
    return (
      <>
        <div className="flex items-center gap-1.5">
          {titleNode}
          <LinkGlyph link={link} />
        </div>
        {card.note && (
          <MarkdownInline className="mt-0.5 block text-xs text-mn-text-secondary">
            {card.note}
          </MarkdownInline>
        )}
      </>
    )
  }
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <input
            className="w-full bg-transparent font-medium outline-none"
            value={card.title}
            aria-label={`Card title: ${card.title || 'untitled'}`}
            onChange={(e) => onTitle(e.target.value)}
            onBlur={(e) => onTitleCommit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
            }}
          />
          <LinkGlyph link={link} />
        </div>
        <input
          className="mt-0.5 w-full bg-transparent text-xs text-mn-text-secondary outline-none"
          value={card.note ?? ''}
          placeholder="Add a note…"
          aria-label={`Card note: ${card.title || 'untitled'}`}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>
      {canLink && onToggleMenu && (
        <button
          type="button"
          aria-label={`Link options: ${card.title || 'untitled'}`}
          aria-haspopup="menu"
          className="leading-none text-mn-text-secondary/60 select-none hover:text-mn-text"
          onClick={onToggleMenu}
        >
          ⋯
        </button>
      )}
      <button
        type="button"
        aria-label={`Archive card: ${card.title || 'untitled'}`}
        className="text-mn-text-secondary/60 hover:text-raw-red"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

/**
 * The card link menu (F27) — a quiet Press popover anchored to the card. Two modes:
 * a small action list, and an inline page picker for "link existing" that filters the
 * pages cache via `links.searchPages`. Closes on outside click or Escape.
 */
function CardLinkMenu({
  links,
  link,
  onOpen,
  onCreate,
  onPick,
  onUnlink,
  onClose,
}: {
  links: PageLinkCapabilities
  link: LinkState
  onOpen: () => void
  onCreate: () => void
  onPick: (ref: PageRef) => void
  onUnlink: () => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'menu' | 'pick'>('menu')
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const isLinked = link.kind !== 'none'

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const results = mode === 'pick' ? links.searchPages(query) : []

  return (
    <div
      ref={ref}
      role="menu"
      className="mn-arrive absolute top-7 right-1 z-50 w-52 rounded-mn-row bg-mn-surface py-1 text-xs shadow-mn-md"
    >
      {mode === 'menu' ? (
        <ul>
          {link.kind === 'linked' && <MenuItem label="Open page" onClick={onOpen} />}
          {link.kind === 'missing' && (
            <li className="px-3 py-1.5 text-mn-text-secondary/70 italic">Linked page is missing</li>
          )}
          <MenuItem label="Create page & link" onClick={onCreate} />
          <MenuItem label="Link existing page…" onClick={() => setMode('pick')} />
          {isLinked && <MenuItem label="Unlink" onClick={onUnlink} destructive />}
        </ul>
      ) : (
        <div className="px-1.5 pb-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            aria-label="Search pages to link"
            className="mb-1 w-full rounded-mn-chrome bg-mn-card/60 px-2 py-1 outline-none placeholder:text-mn-text-secondary/60"
          />
          <ul className="max-h-40 overflow-y-auto">
            {results.length === 0 && <li className="px-2 py-1.5 text-mn-text-secondary/70">No pages</li>}
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onPick(r)}
                  className="block w-full truncate rounded-mn-chrome px-2 py-1.5 text-left hover:bg-mn-wash"
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={[
          'block w-full px-3 py-1.5 text-left hover:bg-mn-wash',
          destructive ? 'text-raw-red/90 hover:text-raw-red' : 'text-mn-text',
        ].join(' ')}
      >
        {label}
      </button>
    </li>
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
      className="mt-2 w-full rounded-mn-row bg-transparent px-2.5 py-1.5 text-xs text-mn-text-secondary outline-none placeholder:text-mn-text-secondary/60 hover:bg-mn-wash focus:bg-mn-wash focus:text-mn-text"
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
