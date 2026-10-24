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
import type { WorkspaceNodeRef } from '@/lib/pages/nav'

import { crumbTrail } from './crumbs'
import { markIndex, resolveMark } from './mark'
import type { PageRow } from './tree'

/**
 * One breadcrumb segment: its label, and where it navigates — never inferred
 * from the node shape, since life's root has no `pages` row to carry.
 *
 * `{ kind: 'page' }` opens that row. `{ kind: 'home' }` opens the pond's root
 * (`workspaceUrl(null)`) — life's own root crumb, and the trash trail's life
 * crumb, both open the pond home even though neither has a row. `null` is a
 * crumb with nothing to open (a virtual trail's non-navigable segment).
 */
export type CommandCrumbTarget = { kind: 'page'; node: WorkspaceNodeRef } | { kind: 'home' } | null

export interface CommandCrumb {
  title: string
  to: CommandCrumbTarget
}

export interface CommandPath {
  glyph: string
  /** The root and the ancestors, root-ward first. */
  trail: CommandCrumb[]
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
    trail: [
      {
        title: root?.title ?? rootTitle,
        to: root
          ? { kind: 'page', node: { id: root.id, type: root.type, title: root.title } }
          : { kind: 'home' },
      },
      ...crumbs.map((c) => ({
        title: c.title,
        to: { kind: 'page', node: { id: c.id, type: c.type, title: c.title } } as const,
      })),
    ],
    current,
    role: own.role,
  }
}

const glyphOf = (id: string, index: ReturnType<typeof markIndex>) => resolveMark(id, index).glyph
