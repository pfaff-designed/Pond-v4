/**
 * The cards for a page's nested pages — pure functions over the flat ['pages']
 * rows, so the derivation is unit-testable without React or Supabase. One
 * derivation feeds the one grid (`ChildrenGrid`) every page renders its children
 * through, Life included (#234: Life is a page).
 *
 * ── The one counting rule (ticket-25, redefined by #108) ─────────────────────
 * A *content page* is a LEAF — a page with no children. There is no
 * `type = 'area'`: the design settles it ("an area is a page with pages inside
 * it; it has no technical meaning"), so container-ness is computed from the
 * tree, not read off a tag. A page with children is organising the pond, so it
 * is not itself counted as content; every leaf below it is. `subtree` reads
 * (recency) still walk the whole tree; only the *numbers* the person reads are
 * leaf counts.
 *
 * Where direct children and deeper descendants differ, the caption says so
 * explicitly ("2 pages · 1 nested") rather than collapsing to one ambiguous
 * total. When they're equal (a flat child list) it reads "N pages inside".
 */

import type { PageRow } from '@/lib/pages/tree'
import { markIndex, resolveMark, type MarkSource } from '@/lib/pages/mark'
import { markAccent } from '@/lib/rail/glyph-library'
import { withoutDatabasesRoot } from '@/lib/pages/databases-root'

export interface ChildCardModel {
  id: string
  type: string
  title: string
  /** The card's own numeral — content pages inside this child (its subtree). */
  stat: string
  /** Quiet caption — how much is inside + recency. */
  sub: string
  /** The page-kind dot's colour; undefined while nobody has chosen one (ink). */
  accent?: string
}

/** "today" · "3d ago" · "2w ago" — calm, coarse recency. */
function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((now.getTime() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/**
 * The ids of every page that holds at least one child — the containers (#108).
 * Computed once per call and threaded down, so the counting helpers stay a
 * single pass over the flat rows instead of re-scanning for every node.
 */
function containerIds(rows: PageRow[]): ReadonlySet<string> {
  const out = new Set<string>()
  for (const r of rows) if (r.parent_id) out.add(r.parent_id)
  return out
}

/** Is this node a content page — i.e. a leaf, not an organising container? */
function isContent(row: PageRow, containers: ReadonlySet<string>): boolean {
  return !containers.has(row.id)
}

function childrenOf(rows: PageRow[], parentId: string | null): PageRow[] {
  return rows
    .filter((r) => r.parent_id === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
}

/**
 * Count content pages (leaves) in a node's subtree, excluding the node itself.
 * Containers nested inside still get walked — their own leaves are counted — but
 * the container rows themselves are never tallied.
 */
function contentDescendants(rows: PageRow[], id: string, containers: ReadonlySet<string>): number {
  return childrenOf(rows, id).reduce(
    (sum, c) =>
      sum + (isContent(c, containers) ? 1 : 0) + contentDescendants(rows, c.id, containers),
    0
  )
}

/** Direct content children (leaves) of a node. */
function directContentChildren(
  rows: PageRow[],
  id: string,
  containers: ReadonlySet<string>
): number {
  return childrenOf(rows, id).filter((c) => isContent(c, containers)).length
}

/** Most recent updated_at across a page's subtree (its own included). */
function subtreeLatest(rows: PageRow[], id: string): string {
  const own = rows.find((r) => r.id === id)?.updated_at ?? ''
  return childrenOf(rows, id).reduce((latest, c) => {
    const childLatest = subtreeLatest(rows, c.id)
    return childLatest > latest ? childLatest : latest
  }, own)
}

/** Singular/plural "page(s)". */
function pagesWord(n: number): string {
  return n === 1 ? 'page' : 'pages'
}

/**
 * The honest "how much is inside" phrase for a card.
 *   • flat (all content sits directly inside): "3 pages inside"
 *   • nested (some content lives deeper): "2 pages · 1 nested"
 *   • empty: "0 pages inside"
 * `nested` is the count of content pages below the direct children.
 */
function insideLabel(direct: number, total: number): string {
  const nested = total - direct
  if (nested > 0) {
    return `${direct} ${pagesWord(direct)} · ${nested} nested`
  }
  return `${total} ${pagesWord(total)} inside`
}

function toCard(
  rows: PageRow[],
  marks: ReadonlyMap<string, MarkSource>,
  row: PageRow,
  containers: ReadonlySet<string>,
  now: Date
): ChildCardModel {
  const direct = directContentChildren(rows, row.id, containers)
  const total = contentDescendants(rows, row.id, containers)
  const latest = subtreeLatest(rows, row.id)
  const ago = latest ? timeAgo(latest, now) : ''
  return {
    id: row.id,
    type: row.type,
    title: row.title || 'Untitled',
    stat: String(total),
    sub: [insideLabel(direct, total), ago && `updated ${ago}`].filter(Boolean).join(' · '),
    // A page-kind dot is a MARK — "Area colours (marks only — area glyph +
    // page-kind dots)" (AGENTS.md §Design language) — so it carries a theme role
    // only when one was chosen, via the same inheritance walk as every other mark.
    accent: markAccent(resolveMark(row.id, marks).role),
  }
}

/**
 * Cards for a page's direct children. `parentId = null` is the root page, Life,
 * whose children are the top-level pages — minus the `databases` root and its
 * subtree (#101; 3c: "one root beside life"), which is a PEER of life, not one of
 * its pages. The same exclusion the rail makes, from the same predicate, so a
 * page can never read as a root on one surface and a child on another.
 */
export function childCards(rows: PageRow[], parentId: string | null, now: Date): ChildCardModel[] {
  const scope = parentId === null ? withoutDatabasesRoot(rows) : rows
  const containers = containerIds(scope)
  const marks = markIndex(scope)
  return childrenOf(scope, parentId).map((c) => toCard(scope, marks, c, containers, now))
}
