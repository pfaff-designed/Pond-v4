/**
 * Destination-picker options for the AI create_page proposal card.
 *
 * A workspace can hold several pages with the SAME title ("Woodworking" as an
 * area and as a project; test pages named identically). A flat title list makes
 * those indistinguishable in the picker, so the user can't tell which one they
 * are saving into. This module builds display labels that disambiguate:
 *
 *   1. A unique title stays as-is.
 *   2. A duplicated title gets its ancestor path appended — "Woodworking
 *      (Creativity)" vs "Woodworking (Personal › Projects)"; top-level
 *      duplicates get "(top level)".
 *   3. Labels STILL colliding after that (same title AND same placement) get
 *      the page type appended. Pages identical in title, placement, and type
 *      remain identical labels — nothing visible distinguishes them.
 *
 * Pure — exercised directly in jest; the AITerminal feeds it the listPages rows.
 */

import type { NodeType } from '@/lib/supabase/types'

export interface ParentPageRow {
  id: string
  parentId: string | null
  type: NodeType
  title: string
}

export interface ParentOptionLabel {
  id: string
  title: string
}

/** Ancestor titles root-first ("Creativity › Woodworking" for a page inside
 *  Woodworking inside Creativity). Cycles in bad data terminate via `seen`. */
function ancestorPath(page: ParentPageRow, byId: Map<string, ParentPageRow>): string[] {
  const path: string[] = []
  const seen = new Set<string>([page.id])
  let parentId = page.parentId
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId)
    if (!parent) break
    seen.add(parent.id)
    path.unshift(parent.title || 'Untitled')
    parentId = parent.parentId
  }
  return path
}

/** Build picker options with duplicate titles disambiguated (see module doc). */
export function toParentOptions(pages: ParentPageRow[]): ParentOptionLabel[] {
  const byId = new Map(pages.map((p) => [p.id, p]))

  const titleCounts = new Map<string, number>()
  for (const p of pages) {
    const title = p.title || 'Untitled'
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1)
  }

  const withPath = pages.map((p) => {
    const title = p.title || 'Untitled'
    if ((titleCounts.get(title) ?? 0) <= 1) return { page: p, label: title }
    const path = ancestorPath(p, byId)
    return { page: p, label: `${title} (${path.length ? path.join(' › ') : 'top level'})` }
  })

  const labelCounts = new Map<string, number>()
  for (const o of withPath) labelCounts.set(o.label, (labelCounts.get(o.label) ?? 0) + 1)

  return withPath.map(({ page, label }) => ({
    id: page.id,
    title: (labelCounts.get(label) ?? 0) > 1 ? `${label} · ${page.type}` : label,
  }))
}

/** Full root-first ancestor path PLUS the page's own title, joined " › "
 *  ("Creativity › Renovation › Kitchen renovation"). A top-level page
 *  returns just its own title. An id absent from `pages` returns "" —
 *  never throws. A dangling or cyclic parentId degrades via `ancestorPath`
 *  to whatever ancestors were reachable. */
export function ancestorPathLabel(pages: ParentPageRow[], id: string): string {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const page = byId.get(id)
  if (!page) return ''
  const path = ancestorPath(page, byId)
  return [...path, page.title || 'Untitled'].join(' › ')
}
