'use client'

/**
 * Reading and making ponds (#312, migration 0018).
 *
 * A pond is an instance of the shell — `Pond 06.13` `s6m5`: "pages, databases,
 * memory, threads and the change log are per pond. Nothing crosses over."
 *
 * `pondId` is NOT yet threaded through the page queries (#318's tracker), so
 * switching ponds changes which pond you are IN without yet changing which pages
 * you see. That is the next slice, not a defect in this one.
 */

import { createClient } from '@/lib/supabase/client'
import { pushRecentGlyph } from '@/lib/rail/glyph-library'
import { clampPondName } from './name'
import type { PondTheme } from '@/lib/supabase/types'

export interface Pond {
  id: string
  name: string
  glyph: string | null
  theme: string
  order: number
  /** Newest first, capped — KAN-27's `ponds.recent_glyphs`, `pushRecentGlyph`'s own shape.
   *  Optional: several fixtures build a `Pond` by hand with no opinion on it. */
  recentGlyphs?: string[]
  /** `s6m6`: "the page you left stays open for when you come back." Null until
   *  visited. A hard delete nulls this via the FK's `on delete set null`, but
   *  trash (migration 0027) is a soft delete — `deleted_at`, the row still
   *  exists — so that FK never fires for it; `listPonds` embeds the page and
   *  reads this back as null itself when it is trashed or gone. Optional for
   *  the same reason `recentGlyphs` is. */
  lastPageId?: string | null
}

interface PondRow {
  id: string
  name: string
  glyph: string | null
  theme: string
  order: number
  recentGlyphs: string[] | null
  lastPage: { id: string; deleted_at: string | null } | null
}

const COLUMNS =
  'id, name, glyph, theme, "order", recentGlyphs:recent_glyphs, lastPage:pages!last_page_id(id, deleted_at)'

/** `PondRow` (the embedded `lastPage`) → `Pond` (the flat `lastPageId`), dropping
 *  a trashed or gone remembered page — see the FK comment on `lastPageId` above. */
function mapPondRow(row: PondRow): Pond {
  return {
    id: row.id,
    name: row.name,
    glyph: row.glyph,
    theme: row.theme,
    order: row.order,
    recentGlyphs: row.recentGlyphs ?? undefined,
    lastPageId: row.lastPage && row.lastPage.deleted_at === null ? row.lastPage.id : null,
  }
}

/** Every pond the signed-in person owns, in switcher order. */
export async function listPonds(): Promise<Pond[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('ponds')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .order('order')

  // The table arrives with migration 0018. Until it is applied, PostgREST answers
  // PGRST205 ("Could not find the table") — the rail then shows its name with no
  // chevron, exactly as it did before, rather than throwing on every render.
  if (error) {
    if (error.code === 'PGRST205') return []
    throw error
  }
  return ((data ?? []) as unknown as PondRow[]).map(mapPondRow)
}

export interface CreatePondOptions {
  glyph?: string
  theme?: PondTheme
}

/**
 * Make a pond. `s6m2`: the name is typed — there is no default, so a blank or
 * whitespace-only name throws here, at the seam, before the insert is ever
 * attempted (KAN-487: a caller that violates the contract is a bug, not a case
 * to recover from). `glyph`/`theme` are optional: omitted means the column
 * default, today's behaviour (KAN-501).
 *
 * Its root page is NOT created here. `getOrCreateHomePage` makes a root on first
 * open, and 0018 deliberately leaves `pages_one_home_per_user` in place, so the
 * root arrives with the slice that teaches `readHomeRow` about ponds (#313).
 */
export async function createPond(name: string, options?: CreatePondOptions): Promise<Pond> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('createPond: a pond needs a name')

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const existing = await listPonds()

  // Cast as the rest of the repo does for writes (see templates/client.ts:162):
  // `Database` is hand-authored, and supabase-js cannot infer an Insert shape from
  // it well enough to accept a quoted-identifier column like `order`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ponds')
    .insert({
      user_id: user.id,
      name: trimmed,
      order: existing.length,
      ...(options?.glyph !== undefined ? { glyph: options.glyph } : {}),
      ...(options?.theme !== undefined ? { theme: options.theme } : {}),
    })
    .select(COLUMNS)
    .single()

  if (error) throw error
  return mapPondRow(data as unknown as PondRow)
}

/**
 * Push `glyph` onto a pond's recent list and persist it — the write over
 * `pushRecentGlyph`'s pure merge. Takes the pond's current list rather than
 * reading it back: the caller (the rail's pick handler) already has it off
 * `usePond()`, and both ends apply the same pure merge to the same snapshot,
 * so there is nothing for a second read to disagree with.
 */
export async function pushRecentGlyphToPond(
  pondId: string,
  recentGlyphs: readonly string[],
  glyph: string
): Promise<string[]> {
  const next = pushRecentGlyph(recentGlyphs, glyph)
  const supabase = createClient()
  // Cast as `createPond` does above: `Database` can't infer an Update shape
  // for a quoted-identifier table either.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('ponds')
    .update({ recent_glyphs: next })
    .eq('id', pondId)
  if (error) throw error
  return next
}

export interface UpdatePondPatch {
  name?: string
  glyph?: string
}

/**
 * Rename a pond and/or change its glyph (KAN-492). Same seam as `createPond`:
 * a provided `name` is trimmed and capped (`clampPondName`, the cap's one
 * home), and a blank/whitespace-only one throws before the write is ever
 * attempted.
 */
export async function updatePond(pondId: string, patch: UpdatePondPatch): Promise<Pond> {
  const update: { name?: string; glyph?: string } = {}
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (!trimmed) throw new Error('updatePond: a pond needs a name')
    update.name = clampPondName(trimmed)
  }
  if (patch.glyph !== undefined) update.glyph = patch.glyph

  const supabase = createClient()
  // Cast as `createPond` does above: `Database` can't infer an Update shape
  // for a quoted-identifier table either.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ponds')
    .update(update)
    .eq('id', pondId)
    .select(COLUMNS)
    .single()

  if (error) throw error
  return mapPondRow(data as unknown as PondRow)
}

/**
 * Remember (or clear, with `pageId: null`) the page a pond was last on —
 * `s6m6`'s write. Owner-scoped by RLS, same shape as `pushRecentGlyphToPond`.
 */
export async function setPondLastPage(pondId: string, pageId: string | null): Promise<void> {
  const supabase = createClient()
  // Cast as `pushRecentGlyphToPond` does above: `Database` can't infer an
  // Update shape for a quoted-identifier table either.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('ponds')
    .update({ last_page_id: pageId })
    .eq('id', pondId)
  if (error) throw error
}
