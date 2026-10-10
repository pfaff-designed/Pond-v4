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

export interface Pond {
  id: string
  name: string
  glyph: string | null
  theme: string
  order: number
  /** Newest first, capped — KAN-27's `ponds.recent_glyphs`, `pushRecentGlyph`'s own shape.
   *  Optional: several fixtures build a `Pond` by hand with no opinion on it. */
  recentGlyphs?: string[]
}

const COLUMNS = 'id, name, glyph, theme, "order", recentGlyphs:recent_glyphs'

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
  return (data ?? []) as Pond[]
}

/**
 * Make a pond. `s6m2`: the name is typed; skipping gives "untitled pond", and
 * glyph and theme take their defaults — which live on the column, so this sends
 * neither (#316 ships both controls disabled).
 *
 * Its root page is NOT created here. `getOrCreateHomePage` makes a root on first
 * open, and 0018 deliberately leaves `pages_one_home_per_user` in place, so the
 * root arrives with the slice that teaches `readHomeRow` about ponds (#313).
 */
export async function createPond(name: string): Promise<Pond> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const trimmed = name.trim()
  const existing = await listPonds()

  // Cast as the rest of the repo does for writes (see templates/client.ts:162):
  // `Database` is hand-authored, and supabase-js cannot infer an Insert shape from
  // it well enough to accept a quoted-identifier column like `order`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('ponds')
    .insert({
      user_id: user.id,
      ...(trimmed ? { name: trimmed } : {}),
      order: existing.length,
    })
    .select(COLUMNS)
    .single()

  if (error) throw error
  return data as Pond
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
