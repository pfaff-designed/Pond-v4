/**
 * What `PondCommand` shows at rest: the path of the page in view
 * (`PondCommand.dc.html`'s `glyph` / `trail` / `current`) — the root, the
 * ancestors, then the page itself at full weight, led by its mark.
 *
 * The root is the trail's own (`crumbTrail`: databases is a peer root, never
 * inside life), else the pond's root page by name. The mark leads with the page
 * in view's OWN glyph when it has one (6y frames 4/5: a page nested in an area
 * can carry a glyph the area doesn't) — else the board's
 * `GLYPH[path[1]] || GLYPH[path[0]]`: the top-level area the page sits in — the
 * page itself when it is top-level — else the root's, else the pond's own glyph.
 */

import type { AreaRole } from '@/lib/rail/glyph-library'

import { crumbTrail } from './crumbs'
import { markIndex, resolveMark } from './mark'
import type { PageRow } from './tree'

export interface CommandPath {
  glyph: string
  /** The root and the ancestors, root-ward first. */
  trail: string[]
  /** The page in view. */
  current: string
  /** The role of the area the page sits in, or itself if it is one; null for ink. */
  role: AreaRole | null
}

export function commandPath(
  rows: PageRow[],
  nodeId: string | null,
  { rootTitle, current, pondGlyph }: { rootTitle: string; current: string; pondGlyph: string }
): CommandPath {
  if (!nodeId) return { glyph: pondGlyph, trail: [], current: rootTitle, role: null }
  const index = markIndex(rows)
  const { root, crumbs } = crumbTrail(rows, nodeId)
  const own = resolveMark(nodeId, index)
  if (root?.id === nodeId) {
    return { glyph: own.glyph ?? pondGlyph, trail: [], current, role: own.role }
  }
  const area = crumbs[0]?.id ?? nodeId
  return {
    glyph:
      (own.glyphIsOwn ? own.glyph : null) ??
      glyphOf(area, index) ??
      (root && glyphOf(root.id, index)) ??
      pondGlyph,
    trail: [root?.title ?? rootTitle, ...crumbs.map((c) => c.title)],
    current,
    role: own.role,
  }
}

const glyphOf = (id: string, index: ReturnType<typeof markIndex>) => resolveMark(id, index).glyph
