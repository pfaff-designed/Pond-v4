/**
 * The breadcrumb trail — pure functions over the flat ['pages'] rows, so the
 * trail is unit-testable without React or Supabase.
 *
 * `Pond 03 Concepts` 3c defines two roots — life for reading, databases for data
 * — and they are peers, so a page under databases must not read as though it were
 * inside life: it is `databases › ingredients`, never `life › databases ›
 * ingredients`. Which root a page belongs to is read off its own ancestry here
 * (through the one `isDatabasesRoot` predicate), not decided at any call site.
 */

import type { PageRow } from '@/lib/pages/tree'
import { isDatabasesRoot } from '@/lib/pages/databases-root'

export interface Crumb {
  id: string
  type: string
  title: string
}

/**
 * The ancestor chain from the root down to — but NOT including — the given node,
 * derived from the parent_id chain. Callers prepend the root themselves (or let
 * {@link crumbTrail} resolve which root that is). Cycle-guarded against malformed
 * data.
 *
 * Example: for Health › Workout Routines › 3-Day routine, passing the routine's
 * id returns [Health, Workout Routines].
 *
 * A caller walking every row (the palette, #279 — AUDIT G7, volume) hands in the
 * `byId` index it already holds, so the walk is linear rather than rebuilding a
 * map per page.
 */
export function ancestorPath(
  rows: PageRow[],
  nodeId: string,
  byId: Map<string, PageRow> = new Map(rows.map((r) => [r.id, r]))
): Crumb[] {
  const chain: Crumb[] = []
  const seen = new Set<string>()
  let current = byId.get(nodeId)?.parent_id ?? null
  while (current && !seen.has(current)) {
    seen.add(current)
    const row = byId.get(current)
    if (!row) break
    chain.unshift({ id: row.id, type: row.type, title: row.title || 'Untitled' })
    current = row.parent_id
  }
  return chain
}

/**
 * The trail for a node, split into the ROOT it descends from and the ancestors
 * below that root (#101 review; ADR 0003 ruling).
 *
 * `root` is the root AS A CRUMB when it is a real `pages` row (the databases
 * root, which a click can therefore open), and `null` for life, whose root is
 * the reserved home row — never in these rows — so the breadcrumb falls back to
 * its `rootLabel` and navigates to the pond's root page. The databases root PAGE
 * is its own trail root, so it reads simply "databases" rather than being placed
 * inside life. Any other node whose ancestry reaches neither root (a top-level
 * page) keeps the life behaviour: there is no third root to invent.
 */
export interface CrumbTrail {
  /** The root the node descends from, as a crumb — null for life's root. */
  root: Crumb | null
  /** The ancestors BELOW that root, root-ward first. */
  crumbs: Crumb[]
}

export function crumbTrail(
  rows: PageRow[],
  nodeId: string,
  byId: Map<string, PageRow> = new Map(rows.map((r) => [r.id, r]))
): CrumbTrail {
  const crumbs = ancestorPath(rows, nodeId, byId)
  const top = crumbs[0]
  // `crumbs[0]` is the chain's own end, which is top-level unless the data is
  // malformed — so the row is re-read to test the real `parent_id`, not assume it.
  const topRow = top ? byId.get(top.id) : undefined
  if (topRow && isDatabasesRoot({ parentId: topRow.parent_id, title: topRow.title })) {
    return { root: top, crumbs: crumbs.slice(1) }
  }
  const own = byId.get(nodeId)
  if (own && isDatabasesRoot({ parentId: own.parent_id, title: own.title })) {
    return { root: { id: own.id, type: own.type, title: own.title || 'Untitled' }, crumbs: [] }
  }
  return { root: null, crumbs }
}
