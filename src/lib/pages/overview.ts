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
 * ── The one counting rule (ticket-25, redefined by #108) ─────────────────────
 * A *content page* is a LEAF — a page with no children. There is no
 * `type = 'area'` any more: the design settles it ("an area is a page with pages
 * inside it; it has no technical meaning"), so container-ness is computed from
 * the tree, not read off a tag. A page with children is organising the pond, so
 * it isn't itself "a page across your life" and no headline number counts it;
 * every leaf below it is. `subtree` counts (recency, presence checks) still walk
 * the whole tree; only the *headline numbers* the user reads are leaf counts.
 *
 * Consequence worth knowing: a brand-new empty page — including an empty
 * top-level one the person means as an area — reads as content until it gains a
 * child, at which point it becomes a container. That is the design's own sense of
 * the words, and it is why the numbers move as a pond fills out.
 *
 * Where direct children and deeper descendants differ, the caption says so
 * explicitly ("2 pages · 1 nested") rather than collapsing to one ambiguous
 * total. When they're equal (a flat child list) it reads "N pages inside".
 *
 * ── Human voice on the focal caption (ticket-33) ─────────────────────────────
 * The counting RULE above is unchanged. What changed is the VOICE of the *focal*
 * caption. The focal numeral is the TOTAL content pages (the intuitive big
 * number); the caption carries the breakdown in a person's words, not math:
 * "Nothing here yet." · "1 page, tucked in Creativity." · "4 pages across your
 * life, 3 of them in Health." · (area) "2 pages within, 1 tucked deeper." The
 * little `phraseFocalCaption` engine below owns that phrasing so the copy lives
 * in one testable place (see the jest phrasing matrix in overview-model.test).
 */

import type { PageRow } from '@/lib/pages/tree'
import { markIndex, resolveMark, type MarkSource } from '@/lib/pages/mark'
import { areaRoleColor } from '@/lib/rail/glyph-library'
import { isDatabasesRoot, withoutDatabasesRoot } from '@/lib/pages/databases-root'

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

/**
 * The ids of every page that holds at least one child — the containers (#108).
 * Computed once per call at the public entry points and threaded down, so the
 * counting helpers stay a single pass over the flat rows instead of re-scanning
 * for every node.
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

/** Every content page (leaf) across the whole workspace. */
function totalContentPages(rows: PageRow[], containers: ReadonlySet<string>): number {
  return rows.filter((r) => isContent(r, containers)).length
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

function toCard(
  rows: PageRow[],
  marks: ReadonlyMap<string, MarkSource>,
  row: PageRow,
  parentById: Map<string, string | null>,
  containers: ReadonlySet<string>,
  now: Date
) {
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
    // page-kind dots)" (AGENTS.md §Design language) — so it carries a theme role,
    // resolved through the same inheritance walk as every other mark (#134).
    accent: areaRoleColor(resolveMark(row.id, marks).role),
  }
}

/**
 * Cards for a node's direct children — the "Everything within" grid model.
 * Shared by the area overview and the composite editor surface (ticket-22), so
 * both read the same derivation.
 */
export function childCards(rows: PageRow[], parentId: string, now: Date): OverviewCardModel[] {
  const parentById = new Map(rows.map((r) => [r.id, r.parent_id]))
  const containers = containerIds(rows)
  const marks = markIndex(rows)
  return childrenOf(rows, parentId).map((c) => toCard(rows, marks, c, parentById, containers, now))
}

// ── The focal-caption phrasing engine (ticket-33) ────────────────────────────

/**
 * The top-level area the Life caption names: where a lone page is tucked
 * ("1 page, tucked in Creativity.") or where a plurality of many pages
 * concentrates ("…, 3 of them in Health."). `null` = no such area (an even
 * spread, a tie, or a top-level page) — the caption keeps the plain total.
 */
export interface DominantArea {
  /** The area holding the concentration, e.g. "Health". */
  name: string
  /** How many content pages live inside it. */
  count: number
}

/**
 * The human breakdown behind a focal numeral — a discriminated union so each
 * scope carries exactly what its sentences need: Life ("across your life")
 * phrases around the dominant area; an area ("within") phrases around its
 * direct/nested split. The engine never sees rows, only resolved numbers and
 * names, so the whole phrasing matrix is a pure table test.
 */
export type FocalPhrasing =
  | {
      scope: 'life'
      /** Total content pages — matches the focal numeral. */
      total: number
      /** See DominantArea; `null` keeps the plain total. */
      dominant: DominantArea | null
    }
  | {
      scope: 'area'
      /** Total content pages within — matches the focal numeral. */
      total: number
      /** Content pages sitting directly inside (not nested deeper). */
      direct: number
    }

/**
 * Turn a resolved breakdown into a calm, human sentence. This is the whole of
 * the voice change (ticket-33): the focal stays the total; this caption speaks
 * the shape of it like a person would. Kept exhaustive and boring on purpose so
 * the phrasing matrix is a jest table. Every branch past the singular guards is
 * guaranteed >= 2, so plural branches spell out "pages" literally.
 */
export function phraseFocalCaption(p: FocalPhrasing): string {
  // ── Empty ──────────────────────────────────────────────────────────────────
  if (p.total === 0) return 'Nothing here yet.'

  if (p.scope === 'life') {
    // ── One page across the whole workspace ───────────────────────────────────
    if (p.total === 1) {
      // Tucked inside an area, or sitting right at the top.
      return p.dominant ? `1 page, tucked in ${p.dominant.name}.` : '1 page, right at the top.'
    }
    // ── Many pages: name the concentration when one area clearly holds it ──────
    if (p.dominant) {
      // Everything lives in the one area → say so plainly, not "4 of them".
      if (p.dominant.count === p.total) {
        return `${p.total} pages across your life, all in ${p.dominant.name}.`
      }
      return `${p.total} pages across your life, ${p.dominant.count} of them in ${p.dominant.name}.`
    }
    // Even spread (no dominant area) → the plain total.
    return `${p.total} pages across your life.`
  }

  // ── Area scope ───────────────────────────────────────────────────────────────
  if (p.total === 1) return '1 page within.'
  const nested = p.total - p.direct
  if (nested > 0) {
    // Some content lives deeper than the direct children.
    return `${p.total} pages within, ${nested} tucked deeper.`
  }
  // All flat, directly inside.
  return `${p.total} pages within.`
}

/**
 * The dominant top-level area for the Life caption: the single area whose
 * subtree holds the strict maximum content, when that's a real concentration
 * (>= 2 pages, and not a tie). A lone page (total === 1) reports the area that
 * holds it regardless of count so it can read "tucked in Creativity." Returns
 * `null` for an even spread, a top-level page, or a workspace with no areas —
 * the caller then keeps the plain total.
 */
function dominantAreaForLife(
  rows: PageRow[],
  total: number,
  containers: ReadonlySet<string>
): DominantArea | null {
  // A top-level page that holds children IS an area, in the design's sense (#108).
  const topAreas = childrenOf(rows, null).filter((r) => !isContent(r, containers))
  const counts = topAreas.map((a) => ({
    name: a.title || 'Untitled',
    count: contentDescendants(rows, a.id, containers),
  }))
  if (counts.length === 0) return null

  const max = Math.max(...counts.map((c) => c.count))
  if (max === 0) return null
  const leaders = counts.filter((c) => c.count === max)
  if (leaders.length !== 1) return null // a tie is an even spread

  // The lone-page case: name the area even for a single page ("tucked in …").
  if (total === 1) return leaders[0]
  // Otherwise only call it dominant when it's a real concentration.
  return max >= 2 ? leaders[0] : null
}

/** The overview for one area page: focal = content pages within, card per direct child. */
export function areaOverview(rows: PageRow[], areaId: string, now: Date): OverviewModel {
  const containers = containerIds(rows)
  const direct = directContentChildren(rows, areaId, containers)
  const within = contentDescendants(rows, areaId, containers)

  return {
    focal: String(within),
    focalCaption: phraseFocalCaption({ scope: 'area', total: within, direct }),
    cards: childCards(rows, areaId, now),
  }
}

/**
 * The Life overview: focal = every content page across the workspace, card per
 * top-level page. The focal is the intuitive TOTAL; the caption speaks the
 * shape of it — where a lone page is tucked, or which area a plurality lives in
 * (ticket-33). The Life caption doesn't need a direct/nested split, but the
 * reconciliation still holds: every content page is either top-level (its own
 * card) or inside exactly one top-level card, so total = top-level content
 * pages + Σ card stats (asserted in overview-model.test).
 *
 * #101: the `databases` root and everything under it are subtracted first. It is
 * the pond's SECOND root (3c, "one root beside life"), a peer of life — so it is
 * neither a card in Life's grid nor counted in "pages across your life", which is
 * the same exclusion the rail makes, from the same predicate. Opening the root
 * itself still gives the ordinary area overview of the databases inside it.
 */
export function lifeOverview(allRows: PageRow[], now: Date): OverviewModel {
  const rows = withoutDatabasesRoot(allRows)
  const parentById = new Map(rows.map((r) => [r.id, r.parent_id]))
  const marks = markIndex(rows)
  const containers = containerIds(rows)
  const roots = childrenOf(rows, null)
  const total = totalContentPages(rows, containers)
  const dominant = dominantAreaForLife(rows, total, containers)

  return {
    focal: String(total),
    focalCaption: phraseFocalCaption({ scope: 'life', total, dominant }),
    cards: roots.map((r) => toCard(rows, marks, r, parentById, containers, now)),
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
 * the Life root themselves (or let {@link crumbTrail} resolve which root that is).
 * Cycle-guarded against malformed data.
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

/**
 * The trail for a node, split into the ROOT it descends from and the ancestors
 * below that root (#101 review; ADR 0003 ruling).
 *
 * `Pond 03 Concepts` 3c defines two roots — life for reading, databases for data
 * — and they are peers, so a page under databases must not read as though it were
 * inside life: it is `databases › ingredients`, never `life › databases ›
 * ingredients`. Which root a page belongs to is read off its own ancestry here
 * (through the one `isDatabasesRoot` predicate), not decided at any call site.
 *
 * `root` is the root AS A CRUMB when it is a real `pages` row (the databases
 * root, which a click can therefore open), and `null` for life, whose root is
 * synthetic — never a row — so the breadcrumb falls back to its `rootLabel` and
 * navigates to the pond's root overview. A node whose ancestry reaches neither
 * root (a top-level page, the databases root itself) keeps that life behaviour:
 * there is no third root to invent.
 */
export function crumbTrail(
  rows: PageRow[],
  nodeId: string
): { root: Crumb | null; crumbs: Crumb[] } {
  const crumbs = ancestorPath(rows, nodeId)
  const top = crumbs[0]
  // `crumbs[0]` is the chain's own end, which is top-level unless the data is
  // malformed — so the row is re-read to test the real `parent_id`, not assume it.
  const topRow = top ? rows.find((r) => r.id === top.id) : undefined
  if (topRow && isDatabasesRoot({ parentId: topRow.parent_id, title: topRow.title })) {
    return { root: top, crumbs: crumbs.slice(1) }
  }
  return { root: null, crumbs }
}
