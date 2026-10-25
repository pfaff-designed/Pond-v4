'use client'

import type { ReactNode } from 'react'
import { AreaMark } from '@/components/atoms/AreaMark'
import { KindDot } from '@/components/atoms/PondAtom'
import { resolveMark, type MarkSource, type PageMark } from '@/lib/pages/mark'
import type { RailNode } from '@/lib/rail/tree'

/**
 * A row's mark, resolved through `resolveMark` so the rail agrees with the
 * breadcrumb, the palette and the cards about every page. `marks` comes from the
 * shared `['pages']` cache, so the rail needs no read of its own. The node itself
 * is the fallback: a rail rendered without a pond (Storybook, a unit test) still
 * shows every area's automatic glyph.
 *
 * Shared by the tree row and the favourites band (KAN-475) — one definition,
 * not two copies.
 */
export const rowMark = (node: RailNode, marks: ReadonlyMap<string, MarkSource>): PageMark =>
  resolveMark(node.id, marks, {
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    title: node.title,
  })

/** The glyph or dot a row's mark draws, shared by the interactive button and the
 *  reserved rows' static (non-interactive) leading mark. */
export const markGlyph = (mark: PageMark, accent: string | undefined, isSelected: boolean): ReactNode =>
  mark.glyph ? (
    <AreaMark glyph={mark.glyph} color={accent} />
  ) : (
    <KindDot
      accent={accent}
      className={!accent ? (isSelected ? 'bg-mn-text' : 'bg-mn-text/50') : undefined}
    />
  )
