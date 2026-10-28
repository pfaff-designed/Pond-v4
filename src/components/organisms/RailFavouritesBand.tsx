'use client'

/**
 * KAN-475 — the pinned band above the rail tree: each favourite as a flat row
 * (mark + title, no chevron, no children), the board's own `pinned` band look
 * (`PondRail.dc.html`: the band's background/shadow/padding, and `pinnedRows`
 * built by the SAME row recipe `mk` as a tree row — fontSize areaRow ? 13.5 :
 * 13, fontWeight areaRow || isSel ? 500 : 400, color areaRow || isSel || hov
 * ? fg : a(.68)).
 *
 * A thin row of its own rather than `RailRow`: a favourite carries none of the
 * tree's machinery (ARIA-tree position, drag, CRUD, the roving tab stop) — it
 * is a flat shortcut, never a folder, outside `role="tree"` entirely (list
 * semantics of its own). It reuses the tree row's own pieces rather than a
 * second copy of each: `rowMark`/`markGlyph` (one shared module, `Rail.tsx`
 * imports the same), `isAreaRow` for the emphasis rule, and
 * `workspaceRenderHref` for a real `<a href>` so ⌘/⇧/middle-click open a new
 * tab the same way a tree row's does (KAN-474) rather than being swallowed by
 * a plain `<button>`.
 */

import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { useState } from 'react'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import type { MarkSource } from '@/lib/pages/mark'
import { isNewTabClick, workspaceRenderHref } from '@/lib/pages/nav'
import { reorderFavouriteIds } from '@/lib/pond/favourites'
import { markAccent } from '@/lib/rail/glyph-library'
import { markGlyph, rowMark } from '@/lib/rail/row-mark'
import {
  ROW_FOCUS_RING,
  ROW_GAP_PY_PR,
  ROW_HOVER_FILL_ON_HOVER,
  ROW_LABEL_HOVER_INK_CSS,
  ROW_LABEL_INK_NOT_FULL,
  ROW_LABEL_SIZE_NOT_EMPHASISED,
  ROW_SELECTED_FILL,
} from '@/lib/rail/row-recipe'
import { isAreaRow, type RailNode } from '@/lib/rail/tree'

/** Before/after only — the band is flat, so there is no `'into'` zone (KAN-569 `choices`). */
type FavouriteDropZone = 'before' | 'after'

export interface RailFavouritesBandProps {
  /** Favourite ids in the order they should render (KAN-475: adding appends to the end). */
  ids: readonly string[]
  /** Every node the rail knows about — resolves a favourite's title/mark and
   *  silently drops an id that no longer resolves to a live page in this pond
   *  (trashed, moved) rather than rewriting the persisted column. */
  nodeById: ReadonlyMap<string, RailNode>
  marks: ReadonlyMap<string, MarkSource>
  /** The active pond, for each row's real `href` (KAN-474's `workspaceRenderHref`). */
  pondId?: string | null
  /** The open page, so its band row reads selected like a tree row. */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Called with the reordered id list on a drop that actually moves a row
   *  (KAN-569) — absent, or a drop on the dragged row itself, calls nothing. */
  onReorder?: (next: readonly string[]) => void
}

/** Absent once every id is dead/unresolved — no empty-looking band renders. */
export function RailFavouritesBand({
  ids,
  nodeById,
  marks,
  pondId = null,
  selectedId = null,
  onSelect,
  onReorder,
}: RailFavouritesBandProps) {
  const rows = ids
    .map((id) => nodeById.get(id))
    .filter((node): node is RailNode => node !== undefined)

  // Drag-to-reorder (KAN-569) — local to the band, unlike the tree's host-owned
  // state, because a favourite never reparents and has no ghost-chip/cycle logic.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: FavouriteDropZone } | null>(
    null
  )

  /** Two-zone hit-test from the pointer's Y within the row — the tree's
   *  middle ("into") zone has no meaning on a flat band. */
  function zoneFor(e: DragEvent<HTMLElement>): FavouriteDropZone {
    const rect = e.currentTarget.getBoundingClientRect()
    return (e.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after'
  }

  const handleDragStart = (id: string, e: DragEvent<HTMLAnchorElement>) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id) // Firefox requires data to start a drag.
  }

  const handleDragOver = (id: string, e: DragEvent<HTMLAnchorElement>) => {
    if (!draggingId || draggingId === id) return // no indicator over the dragged row itself
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ id, zone: zoneFor(e) })
  }

  const handleDragLeave = (id: string, e: DragEvent<HTMLAnchorElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropTarget((prev) => (prev?.id === id ? null : prev))
  }

  const handleDrop = (id: string, e: DragEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const dragged = draggingId
    const zone = dropTarget?.id === id ? dropTarget.zone : zoneFor(e)
    setDraggingId(null)
    setDropTarget(null)
    if (dragged && dragged !== id) onReorder?.(reorderFavouriteIds(ids, dragged, id, zone))
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  /** ⌥↑/⌥↓ on a focused row — the same adjacent-swap a one-row drag onto the
   *  row above/below produces, against the live (rendered) sibling rather
   *  than a raw id that may be a dead/unresolved entry. */
  const handleKeyDown = (id: string, e: KeyboardEvent<HTMLAnchorElement>) => {
    if (!onReorder || !e.altKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const index = rows.findIndex((node) => node.id === id)
    const sibling = rows[e.key === 'ArrowUp' ? index - 1 : index + 1]
    if (!sibling) return
    onReorder(reorderFavouriteIds(ids, id, sibling.id, e.key === 'ArrowUp' ? 'before' : 'after'))
  }

  if (rows.length === 0) return null

  return (
    <div
      data-part="favourites-band"
      role="list"
      aria-label="favourites"
      className="relative z-[1] mb-1 flex flex-col bg-mn-card pb-1 shadow-[0_1px_0_rgba(27,29,20,.09),0_6px_10px_-6px_rgba(40,34,24,.12)] dark:shadow-[0_1px_0_rgba(250,249,239,.09),0_6px_10px_-6px_rgba(0,0,0,.4)]"
    >
      {rows.map((node) => {
        const isSelected = node.id === selectedId
        const isArea = isAreaRow(node)
        // Size follows the AREA state alone; weight/ink follow area OR
        // selected — the tree row's own split (Rail.tsx's `isAreaRow` size
        // guard vs. its `isFullInk`/`emphasis` checks), so a selected
        // non-area row stays 13px/500, never jumping to the area's 13.5px.
        const isEmphasised = isArea || isSelected
        const mark = rowMark(node, marks)
        const accent = markAccent(mark.role)
        const label = node.title || 'Untitled'
        const href = workspaceRenderHref(node, pondId)
        const isDragging = draggingId === node.id
        const zone = dropTarget?.id === node.id ? dropTarget.zone : null
        const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
          if (isNewTabClick(e)) return
          e.preventDefault()
          onSelect?.(node.id)
        }
        return (
          <a
            key={node.id}
            href={href}
            role="listitem"
            aria-label={label}
            data-favourite-row={node.id}
            aria-current={isSelected ? 'true' : undefined}
            draggable={Boolean(onReorder)}
            onClick={handleClick}
            onDragStart={onReorder ? (e) => handleDragStart(node.id, e) : undefined}
            onDragOver={onReorder ? (e) => handleDragOver(node.id, e) : undefined}
            onDragLeave={onReorder ? (e) => handleDragLeave(node.id, e) : undefined}
            onDrop={onReorder ? (e) => handleDrop(node.id, e) : undefined}
            onDragEnd={onReorder ? handleDragEnd : undefined}
            onKeyDown={onReorder ? (e) => handleKeyDown(node.id, e) : undefined}
            className={`group relative mx-2 flex w-[calc(100%-16px)] items-center rounded-mn-row ${ROW_GAP_PY_PR} pl-1 text-left outline-none ${ROW_FOCUS_RING} ${
              isSelected ? ROW_SELECTED_FILL : ROW_HOVER_FILL_ON_HOVER
            } ${isDragging ? 'opacity-[.35]' : ''}`}
          >
            {/* Reuses the tree's own drop-line (Rail.tsx) — same inset, same
                part name — for the band's flat before/after reorder. */}
            {zone && (
              <span
                aria-hidden
                data-part="drop-line"
                className={`pointer-events-none absolute right-2 left-[50px] h-0.5 rounded-mn-hair bg-mn-text ${
                  zone === 'before' ? '-top-px' : '-bottom-px'
                }`}
              />
            )}
            <span className="w-[9px] flex-shrink-0" aria-hidden />
            <PondMolecule
              kind="list-row"
              state={isSelected ? 'selected' : 'rest'}
              title={label}
              meta=""
              handle={false}
              dot={false}
              accent={accent}
              emphasis={isEmphasised}
              leading={markGlyph(mark, accent, isSelected)}
              className={`min-h-0 w-full min-w-0 flex-1 gap-[7px] bg-transparent p-0${
                isArea ? '' : ` ${ROW_LABEL_SIZE_NOT_EMPHASISED}`
              }${
                isEmphasised ? '' : ` ${ROW_LABEL_INK_NOT_FULL} ${ROW_LABEL_HOVER_INK_CSS}`
              } leading-[normal]`}
            />
          </a>
        )
      })}
    </div>
  )
}
