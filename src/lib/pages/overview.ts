/**
 * The data behind an overview surface — pure functions over the flat ['pages']
 * rows so the model is unit-testable without React or Supabase.
 *
 * Two shapes, one model:
 *   • an AREA overview (nodeId = the area): a card per direct child, focal
 *     numeral = how much content lives inside
 *   • the LIFE overview (nodeId = null): a card per top-level page, focal
 *     numeral = every content page across the workspace
 *
 * ── The one counting rule (ticket-25) ────────────────────────────────────────
 * A *content page* is any node whose `type !== 'area'`. Areas are the shell —
 * the rail renders `type='area'` as a collapsible folder; they organise content
 * but aren't themselves "a page across your life", so every count here excludes
 * areas. `subtree` counts (recency, presence checks) still walk the whole tree;
 * only the *headline numbers* the user reads are content-page counts.
 *
 * Where direct children and deeper descendants differ, the caption says so
 * explicitly ("2 pages · 1 nested") rather than collapsing to one ambiguous
 * total. When they're equal (a flat child list) it reads "N pages inside".
 */

import type { PageRow } from '@/lib/pages/tree'
import { pageAccent, rootAncestorId } from '@/lib/pages/accent'

export interface OverviewCardModel {
  id: string
  type: string
  title: string
  /** The card's own numeral — content pages inside this child (its subtree). */
  stat: string
  /** Quiet mono caption — how much is inside + recency. */
  sub: string
  accent: string
}

export interface OverviewModel {
  focal: string
  focalCaption: string
  cards: OverviewCardModel[]
}

/** "today" · "3d ago" · "2w ago" — calm, coarse recency. */
export function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((now.getTime() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Is this node a content page (not an organising area folder)? */
function isContent(row: PageRow): boolean {
  return row.type !== 'area'
}

function childrenOf(rows: PageRow[], parentId: string | null): PageRow[] {
  return rows
    .filter((r) => r.parent_id === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
}

/**
 * Count content pages (non-areas) in a node's subtree, excluding the node
 * itself. Areas nested inside still get walked — their own content descendants
 * are counted — but the area rows themselves are never tallied.
 */
function contentDescendants(rows: PageRow[], id: string): number {
  return childrenOf(rows, id).reduce(
    (sum, c) => sum + (isContent(c) ? 1 : 0) + contentDescendants(rows, c.id),
    0
  )
}

/** Direct content children (non-areas) of a node. */
function directContentChildren(rows: PageRow[], id: string): number {
  return childrenOf(rows, id).filter(isContent).length
}

/** Every content page across the whole workspace. */
function totalContentPages(rows: PageRow[]): number {
  return rows.filter(isContent).length
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
export function insideLabel(direct: number, total: number): string {
  const nested = total - direct
  if (nested > 0) {
    return `${direct} ${pagesWord(direct)} · ${nested} nested`
  }
  return `${total} ${pagesWord(total)} inside`
}

function toCard(rows: PageRow[], row: PageRow, parentById: Map<string, string | null>, now: Date) {
  const direct = directContentChildren(rows, row.id)
  const total = contentDescendants(rows, row.id)
  const latest = subtreeLatest(rows, row.id)
  const ago = latest ? timeAgo(latest, now) : ''
  return {
    id: row.id,
    type: row.type,
    title: row.title || 'Untitled',
    stat: String(total),
    sub: [insideLabel(direct, total), ago && `updated ${ago}`].filter(Boolean).join(' · '),
    accent: pageAccent(rootAncestorId(row.id, parentById)),
  }
}

/**
 * Cards for a node's direct children — the "Everything within" grid model.
 * Shared by the area overview and the composite editor surface (ticket-22), so
 * both read the same derivation.
 */
export function childCards(rows: PageRow[], parentId: string, now: Date): OverviewCardModel[] {
  const parentById = new Map(rows.map((r) => [r.id, r.parent_id]))
  return childrenOf(rows, parentId).map((c) => toCard(rows, c, parentById, now))
}

/**
 * The focal caption for a "content inside" numeral — matches the honest count.
 * The same direct·nested split the cards use (ticket-25): when some content
 * lives deeper than the direct children, the caption spells the split out
 * ("1 page · 1 nested within.") so the focal is never bigger than the cards
 * below can explain. `suffix` places the count ("within" for an area, "across
 * your life" for Life); `singular`/`plural` are the flat-case captions.
 */
function focalCaption(
  direct: number,
  total: number,
  suffix: string,
  singular: string,
  plural: string,
  empty: string
): string {
  if (total === 0) return empty
  if (direct !== total) {
    return `${direct} ${pagesWord(direct)} · ${total - direct} nested ${suffix}.`
  }
  return total === 1 ? singular : plural
}

/** The overview for one area page: focal = content pages within, card per direct child. */
export function areaOverview(rows: PageRow[], areaId: string, now: Date): OverviewModel {
  const direct = directContentChildren(rows, areaId)
  const within = contentDescendants(rows, areaId)

  return {
    focal: String(within),
    focalCaption: focalCaption(
      direct,
      within,
      'within',
      'page within, at a glance.',
      'pages within, at a glance.',
      'nothing inside yet — add a page, or ask Pond.'
    ),
    cards: childCards(rows, areaId, now),
  }
}

/**
 * The Life overview: focal = every content page across the workspace, card per
 * top-level page. `direct` is the top-level content pages: each is its own card
 * whose stat counts only what's INSIDE it (0 for a leaf), so the nested split
 * is what reconciles the focal with the cards — every content page is either
 * top-level (the "N pages" part) or inside exactly one top-level card (the
 * "M nested" part, which equals the sum of the card stats).
 */
export function lifeOverview(rows: PageRow[], now: Date): OverviewModel {
  const parentById = new Map(rows.map((r) => [r.id, r.parent_id]))
  const roots = childrenOf(rows, null)
  const direct = roots.filter(isContent).length
  const total = totalContentPages(rows)

  return {
    focal: String(total),
    focalCaption: focalCaption(
      direct,
      total,
      'across your life',
      'page across your life.',
      'pages across your life.',
      'nothing here yet — create a page, or ask Pond.'
    ),
    cards: roots.map((r) => toCard(rows, r, parentById, now)),
  }
}

// ── Breadcrumb (ticket-25) ────────────────────────────────────────────────────

export interface Crumb {
  id: string
  type: string
  title: string
}

/**
 * The ancestor chain from the root down to — but NOT including — the given node,
 * derived from the parent_id chain. `["Life", …ancestors]`-less: callers prepend
 * the Life root themselves. Cycle-guarded against malformed data.
 *
 * Example: for Health › Workout Routines › 3-Day routine, passing the routine's
 * id returns [Health, Workout Routines].
 */
export function ancestorPath(rows: PageRow[], nodeId: string): Crumb[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
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
