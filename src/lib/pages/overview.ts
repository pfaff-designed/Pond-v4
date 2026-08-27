/**
 * The data behind an overview surface — pure functions over the flat ['pages']
 * rows so the model is unit-testable without React or Supabase.
 *
 * Two shapes, one model:
 *   • an AREA overview (nodeId = the area): a card per direct child, focal
 *     numeral = how much lives inside
 *   • the LIFE overview (nodeId = null): a card per top-level page, focal
 *     numeral = every page across the workspace
 */

import type { PageRow } from '@/lib/pages/tree'
import { pageAccent, rootAncestorId } from '@/lib/pages/accent'

export interface OverviewCardModel {
  id: string
  type: string
  title: string
  /** The card's own numeral — pages inside this child (its whole subtree). */
  stat: string
  /** Quiet mono caption — recent activity. */
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

function childrenOf(rows: PageRow[], parentId: string | null): PageRow[] {
  return rows
    .filter((r) => r.parent_id === parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title))
}

/** Size of a page's subtree including itself. */
function subtreeSize(rows: PageRow[], id: string): number {
  return 1 + childrenOf(rows, id).reduce((sum, c) => sum + subtreeSize(rows, c.id), 0)
}

/** Most recent updated_at across a page's subtree (its own included). */
function subtreeLatest(rows: PageRow[], id: string): string {
  const own = rows.find((r) => r.id === id)?.updated_at ?? ''
  return childrenOf(rows, id).reduce((latest, c) => {
    const childLatest = subtreeLatest(rows, c.id)
    return childLatest > latest ? childLatest : latest
  }, own)
}

function toCard(rows: PageRow[], row: PageRow, parentById: Map<string, string | null>, now: Date) {
  const inside = subtreeSize(rows, row.id) - 1
  const latest = subtreeLatest(rows, row.id)
  const ago = latest ? timeAgo(latest, now) : ''
  return {
    id: row.id,
    type: row.type,
    title: row.title || 'Untitled',
    stat: String(inside),
    sub: [`${inside === 1 ? '1 page' : `${inside} pages`} inside`, ago && `updated ${ago}`]
      .filter(Boolean)
      .join(' · '),
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

/** The overview for one area page: focal = pages within, card per direct child. */
export function areaOverview(rows: PageRow[], areaId: string, now: Date): OverviewModel {
  const within = subtreeSize(rows, areaId) - 1

  return {
    focal: String(within),
    focalCaption:
      within === 0
        ? 'nothing inside yet — add a page, or ask Pond.'
        : within === 1
          ? 'page within, at a glance.'
          : 'pages within, at a glance.',
    cards: childCards(rows, areaId, now),
  }
}

/** The Life overview: focal = every page across the workspace, card per top-level page. */
export function lifeOverview(rows: PageRow[], now: Date): OverviewModel {
  const parentById = new Map(rows.map((r) => [r.id, r.parent_id]))
  const roots = childrenOf(rows, null)

  return {
    focal: String(rows.length),
    focalCaption:
      rows.length === 0
        ? 'nothing here yet — create a page, or ask Pond.'
        : rows.length === 1
          ? 'page across your life.'
          : 'pages across your life.',
    cards: roots.map((r) => toCard(rows, r, parentById, now)),
  }
}
