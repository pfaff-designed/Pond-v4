/**
 * One-way made-from provenance (issue #154, epic #117 Phase 4).
 *
 * THE LAW: a template is a shape you copy, never a tie. When a template is
 * applied, its blocks are COPIED onto the new page and the page's `props` gets
 * ONE stamp — `props.madeFromTemplate = { templateId, name, at }` — written once
 * on apply and never updated. That stamp is:
 *
 *   ONE-WAY.   The page remembers the template; the template knows nothing of
 *              the page. There is no FK, no back-reference column, no row on the
 *              template side. The reads below (count / list / sibling ranking)
 *              scan `pages.props`; they never consult `templates`.
 *
 *   ADVISORY.  Nothing may read the stamp to CHANGE a page. It informs a
 *              caption ("made from Weekly review"), a count on the settings
 *              list (#158) and the "templates used by sibling pages rank first"
 *              ordering of the picker (6f/6i). Editing a template
 *              (`saveTemplateBlocks`, `renameTemplate`) and deleting one
 *              (`deleteTemplate`) must not touch any page carrying its stamp —
 *              not the blocks, not the props, not `updated_at`. A stamp whose
 *              template is gone is still a true statement about where the page
 *              came from, and stays as it is.
 *
 * Where it lives: in the existing `pages.props` jsonb, as a SIBLING key to the
 * reserved `props._schema` (`@/lib/properties/schema`) — never nested inside it,
 * so the merge helpers that guard the schema never see or clobber it. No new
 * column (contrast #134's glyph/area_role, which are rendered marks; provenance
 * is a note about origin, which is exactly what `props` holds).
 *
 * Framework-agnostic — pure functions plus Supabase reads, no Next.js, no React.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { PondTemplate } from './types'

// ── The stamp ────────────────────────────────────────────────────────────────

/** The `props` key that holds the stamp. Sibling of `_schema`, never inside it. */
export const MADE_FROM_TEMPLATE_KEY = 'madeFromTemplate' as const

export interface MadeFromTemplate {
  templateId: string
  /** The template's name AT APPLY TIME — a later rename does not reach back. */
  name: string
  /** ISO timestamp of the apply. */
  at: string
}

/**
 * Stamp a page's props with where it came from. Pure: returns a new object and
 * leaves the input untouched. Written ONCE — if the props already carry a stamp,
 * the SAME object is returned and the existing stamp stands, whatever template is
 * passed. (A page is made from exactly one template, at one moment.)
 */
export function stampProvenance(
  props: Record<string, unknown>,
  template: Pick<PondTemplate, 'id' | 'name'>,
  at: string = new Date().toISOString()
): Record<string, unknown> {
  if (readProvenance(props)) return props
  const stamp: MadeFromTemplate = { templateId: template.id, name: template.name, at }
  return { ...props, [MADE_FROM_TEMPLATE_KEY]: stamp }
}

/** Read the stamp off a page's props, or null when absent or malformed. */
export function readProvenance(props: Record<string, unknown>): MadeFromTemplate | null {
  const value = props[MADE_FROM_TEMPLATE_KEY]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.templateId !== 'string' || typeof v.name !== 'string' || typeof v.at !== 'string') {
    return null
  }
  return { templateId: v.templateId, name: v.name, at: v.at }
}

// ── Reads over pages.props ───────────────────────────────────────────────────
//
// All three are pond-scoped (user_id + workspace, ticket-43) and use jsonb
// containment on `props` so Postgres does the matching. None of them reads
// `templates`: a count or a ranking is as true for a deleted template as for a
// living one.

/** The jsonb containment filter for "stamped with this template". */
function stampFilter(templateId: string): Record<string, unknown> {
  return { [MADE_FROM_TEMPLATE_KEY]: { templateId } }
}

/** How many pages in the pond were made from this template. */
export async function countPagesMadeFrom(
  supabase: SupabaseClient<Database>,
  userId: string,
  /** #312: scope to one pond; omitted reads across ponds (`s6m5`). */
  pondId: string | null | undefined,
  templateId: string
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from('pages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  // Conditional: `.eq('pond_id', null)` would match only rows with NO pond.
  if (pondId) q = q.eq('pond_id', pondId)
  const { count, error } = await q.contains('props', stampFilter(templateId))

  if (error) throw new Error(error.message)
  return count ?? 0
}

/** A page made from a template — the lean shape a settings list needs. */
export interface PageMadeFrom {
  id: string
  title: string
  parentId: string | null
  madeFrom: MadeFromTemplate
}

type MadeFromRow = {
  id: string
  title: string
  parent_id: string | null
  props: unknown
}

/** The pages in the pond made from this template, most recently updated first. */
export async function listPagesMadeFrom(
  supabase: SupabaseClient<Database>,
  userId: string,
  /** #312: scope to one pond; omitted reads across ponds (`s6m5`). */
  pondId: string | null | undefined,
  templateId: string,
  limit = 20
): Promise<PageMadeFrom[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from('pages')
    .select('id, title, parent_id, props')
    .eq('user_id', userId)
  if (pondId) q = q.eq('pond_id', pondId)
  const { data, error } = await q
    .contains('props', stampFilter(templateId))
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  const out: PageMadeFrom[] = []
  for (const row of (data ?? []) as MadeFromRow[]) {
    const madeFrom = readProvenance(toProps(row.props))
    // The containment filter guarantees a stamp; a malformed one is skipped,
    // not thrown, so one odd row never empties the list.
    if (!madeFrom) continue
    out.push({ id: row.id, title: row.title, parentId: row.parent_id ?? null, madeFrom })
  }
  return out
}

/**
 * Template ids used by the children of `parentId` (root when null), most-used
 * first — the data behind 6f/6i's "templates used by sibling pages rank first".
 * Ties break on the most recent apply, then id, so the order is deterministic.
 * Unstamped siblings contribute nothing; an empty sibling group returns [].
 */
export async function siblingTemplateRanking(
  supabase: SupabaseClient<Database>,
  userId: string,
  /** #312: scope to one pond; omitted reads across ponds (`s6m5`). */
  pondId: string | null | undefined,
  parentId: string | null
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any).from('pages').select('props').eq('user_id', userId)
  if (pondId) query = query.eq('pond_id', pondId)

  // PostgREST needs `.is()` for null, `.eq()` otherwise.
  query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId)

  const { data, error } = await query.not(`props->${MADE_FROM_TEMPLATE_KEY}`, 'is', null)

  if (error) throw new Error(error.message)

  const tally = new Map<string, { uses: number; latest: string }>()
  for (const row of (data ?? []) as { props: unknown }[]) {
    const stamp = readProvenance(toProps(row.props))
    if (!stamp) continue
    const entry = tally.get(stamp.templateId)
    if (entry) {
      entry.uses += 1
      if (stamp.at > entry.latest) entry.latest = stamp.at
    } else {
      tally.set(stamp.templateId, { uses: 1, latest: stamp.at })
    }
  }

  return [...tally.entries()]
    .sort(
      ([idA, a], [idB, b]) =>
        b.uses - a.uses || b.latest.localeCompare(a.latest) || idA.localeCompare(idB)
    )
    .map(([id]) => id)
}

/** Props are stored as jsonb; coerce anything non-object (or array/null) to {}. */
function toProps(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
