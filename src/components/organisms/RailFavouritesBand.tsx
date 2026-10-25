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

import type { MouseEvent } from 'react'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import type { MarkSource } from '@/lib/pages/mark'
import { isNewTabClick, workspaceRenderHref } from '@/lib/pages/nav'
import { markAccent } from '@/lib/rail/glyph-library'
import { markGlyph, rowMark } from '@/lib/rail/row-mark'
import { isAreaRow, type RailNode } from '@/lib/rail/tree'

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
}

/** Absent once every id is dead/unresolved — no empty-looking band renders. */
export function RailFavouritesBand({
  ids,
  nodeById,
  marks,
  pondId = null,
  selectedId = null,
  onSelect,
}: RailFavouritesBandProps) {
  const rows = ids
    .map((id) => nodeById.get(id))
    .filter((node): node is RailNode => node !== undefined)

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
        const isEmphasised = isAreaRow(node) || isSelected
        const mark = rowMark(node, marks)
        const accent = markAccent(mark.role)
        const label = node.title || 'Untitled'
        const href = workspaceRenderHref(node, pondId)
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
            onClick={handleClick}
            className={`group relative mx-2 flex w-[calc(100%-16px)] items-center gap-[7px] rounded-mn-row py-[5px] pr-2 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-mn-text/50 ${
              isSelected ? 'bg-mn-hover-fill' : 'hover:bg-mn-rail-hover'
            }`}
          >
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
                isEmphasised ? '' : ' text-[13px] text-mn-text-secondary group-hover:text-mn-text'
              } leading-[normal]`}
            />
          </a>
        )
      })}
    </div>
  )
}
