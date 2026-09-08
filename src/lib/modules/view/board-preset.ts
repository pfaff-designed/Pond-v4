/**
 * `/board` preset seeding (board-authoring Slice 1).
 *
 * The `view` block is config-only and draws its HOST page's collection rows. A board
 * needs a select/status property to bucket cards into columns — so dropping `/board`
 * on a page that isn't yet a collection has nothing to group by. This helper makes
 * `/board` "just work": it ensures the host page has a group-by property, seeding a
 * default `Status` (To do / Doing / Done) when none exists, and returns the property
 * id the new board should group by.
 *
 * Reuses an EXISTING select/status property when the page already has one (so a
 * second board on a collection groups by the same status the AI or a prior board
 * established, rather than piling on duplicate columns). The seed appends to any
 * existing schema via `defineSchema` (read-modify-write), never clobbering rows.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getPage, defineSchema } from '@/lib/pages/client'
import { readSchema, type PropertyDef } from '@/lib/properties/schema'

/** The default status column set a fresh board seeds. */
export const DEFAULT_STATUS_OPTIONS = ['To do', 'Doing', 'Done'] as const

/** Mint a default `Status` property (status type, To do / Doing / Done). */
function makeStatusProperty(newId: () => string): PropertyDef {
  return {
    id: newId(),
    name: 'Status',
    type: 'status',
    options: DEFAULT_STATUS_OPTIONS.map((label) => ({ id: newId(), label })),
  }
}

/**
 * Ensure the host page can back a board and return the property id to group by.
 * If the page already carries a select/status property, reuse the FIRST one;
 * otherwise seed a default `Status` property onto the page's schema.
 */
export async function ensureBoardGroupBy(
  supabase: SupabaseClient<Database>,
  pageId: string,
  newId: () => string = () => crypto.randomUUID()
): Promise<string> {
  const page = await getPage(supabase, pageId)
  const schema = readSchema(page?.props) ?? []
  const existing = schema.find((d) => d.type === 'status' || d.type === 'select')
  if (existing) return existing.id

  const statusProp = makeStatusProperty(newId)
  await defineSchema(supabase, pageId, [...schema, statusProp])
  return statusProp.id
}
