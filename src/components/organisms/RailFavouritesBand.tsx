'use client'

/**
 * KAN-475 — the pinned band above the rail tree: each favourite as a flat row
 * (mark + title, no chevron, no children), the board's own `pinned` band look
 * (`PondRail.dc.html`: the band's background/shadow/padding, and the row
 * recipe's size/weight/ink for a depth-0 row — 13.5px/500/full ink, the same
 * values `PondMolecule`'s `list-row` kind already carries under `emphasis`).
 *
 * A thin row of its own rather than `RailRow`: a favourite carries none of the
 * tree's machinery (ARIA-tree position, drag, CRUD, the roving tab stop) — it
 * is a flat shortcut, never a folder. The mark recipe (glyph vs. dot) mirrors
 * `Rail.tsx`'s own private `rowMark`/`markGlyph` rather than importing them,
 * since `Rail.tsx` mounts this component (KAN-475's next slice) and importing
 * back from it would make the two modules circular.
 */

import type { ReactNode } from 'react'
import { AreaMark } from '@/components/atoms/AreaMark'
import { KindDot } from '@/components/atoms/PondAtom'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { resolveMark, type MarkSource, type PageMark } from '@/lib/pages/mark'
import { markAccent } from '@/lib/rail/glyph-library'
import type { RailNode } from '@/lib/rail/tree'

const favouriteMark = (node: RailNode, marks: ReadonlyMap<string, MarkSource>): PageMark =>
  resolveMark(node.id, marks, {
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    title: node.title,
  })

const favouriteGlyph = (mark: PageMark, accent: string | undefined, isSelected: boolean): ReactNode =>
  mark.glyph ? (
    <AreaMark glyph={mark.glyph} color={accent} />
  ) : (
    <KindDot
      accent={accent}
      className={!accent ? (isSelected ? 'bg-mn-text' : 'bg-mn-text/50') : undefined}
    />
  )

export interface RailFavouritesBandProps {
  /** Favourite ids in the order they should render (KAN-475: adding appends to the end). */
  ids: readonly string[]
  /** Every node the rail knows about — resolves a favourite's title/mark and
   *  silently drops an id that no longer resolves to a live page in this pond
   *  (trashed, moved) rather than rewriting the persisted column. */
  nodeById: ReadonlyMap<string, RailNode>
  marks: ReadonlyMap<string, MarkSource>
  /** The open page, so its band row reads selected like a tree row. */
  selectedId?: string | null
  onSelect?: (id: string) => void
}

/** Absent once every id is dead/unresolved — no empty-looking band renders. */
export function RailFavouritesBand({
  ids,
  nodeById,
  marks,
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
      className="relative z-[1] mb-1 flex flex-col bg-mn-card pb-1 shadow-[0_1px_0_rgba(27,29,20,.09),0_6px_10px_-6px_rgba(40,34,24,.12)] dark:shadow-[0_1px_0_rgba(250,249,239,.09),0_6px_10px_-6px_rgba(0,0,0,.4)]"
    >
      {rows.map((node) => {
        const isSelected = node.id === selectedId
        const mark = favouriteMark(node, marks)
        const accent = markAccent(mark.role)
        const label = node.title || 'Untitled'
        return (
          <button
            key={node.id}
            type="button"
            data-favourite-row={node.id}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelect?.(node.id)}
            className={`relative mx-2 flex w-[calc(100%-16px)] items-center gap-[7px] rounded-mn-row py-[5px] pr-2 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-mn-text/50 ${
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
              emphasis
              leading={favouriteGlyph(mark, accent, isSelected)}
              className="min-h-0 w-full min-w-0 flex-1 gap-[7px] bg-transparent p-0 leading-[normal]"
            />
          </button>
        )
      })}
    </div>
  )
}
