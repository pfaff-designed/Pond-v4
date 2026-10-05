/**
 * Persistence layer for the template store (issue #154, epic #117 Phase 4).
 *
 * One row in `public.templates` per saved shape, scoped per pond (user_id +
 * workspace). Mirrors the framework-free shape of `src/lib/pages/client.ts`:
 * takes a SupabaseClient, no Next.js and no React, cast-to-any on insert/update
 * chains (the generated builder types don't narrow through them).
 *
 * Two deliberate differences from the pages client:
 *   - A name collision is the person's to resolve. `createTemplate` and
 *     `renameTemplate` raise a typed {@link DuplicateTemplateNameError} (the
 *     template twin of `DuplicateTitleError`, `pages/dedupe-title.ts`) and
 *     explicitly do NOT auto-suffix the way `createPage` does (#84).
 *   - Nothing here touches `pages`. A template is a shape you copy, never a
 *     tie — see `provenance.ts` — so deleting one is a single-table delete.
 *
 * Reads by id (getTemplate, renameTemplate, saveTemplateBlocks, deleteTemplate)
 * are id-scoped and trust the caller, exactly as the pages client does.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/modules/content'
import { firstPondId } from '@/lib/pond/first'
import {
  isTemplateKind,
  isTemplateOrigin,
  type PondTemplate,
  type TemplateKind,
  type TemplateOrigin,
} from './types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  name: string
  kind: TemplateKind
  blocks?: Block[]
  /** Defaults to 'yours' — a saved template is the person's own. */
  origin?: TemplateOrigin
  /**
   * #312: the pond this template belongs to. `listTemplates` filters on it, so an
   * unstamped template is invisible in every pond. `workspace` was retired by
   * 0020 — the sandbox is a pond (#315).
   */
  pondId?: string | null
}

type TemplateRow = {
  id: string
  name: string
  kind: string
  blocks: unknown
  origin: string
  created_at: string
  updated_at: string
}

export const TEMPLATE_COLUMNS = 'id, name, kind, blocks, origin, created_at, updated_at'

/**
 * Thrown when a template name collides with another in the same pond
 * (case-insensitive, whitespace-trimmed — the `templates_name_uniq` index). The
 * UI shows the message inline; nothing is renamed or suffixed on the caller's
 * behalf.
 */
export class DuplicateTemplateNameError extends Error {
  constructor(public readonly templateName: string) {
    super(`A template named “${templateName}” already exists in this pond.`)
    this.name = 'DuplicateTemplateNameError'
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type PostgrestError = { code?: string; message?: string } | null

function isUniqueViolation(error: PostgrestError): boolean {
  return error?.code === '23505'
}

/** Blocks are stored as jsonb; coerce anything non-array to []. */
function toBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : []
}

function mapRow(row: TemplateRow): PondTemplate {
  // The DB CHECKs make these unreachable; if one fires, the row is from a
  // future migration this build doesn't understand — say so loudly.
  if (!isTemplateKind(row.kind)) {
    throw new Error(`templates: unknown kind '${row.kind}' on template ${row.id}`)
  }
  if (!isTemplateOrigin(row.origin)) {
    throw new Error(`templates: unknown origin '${row.origin}' on template ${row.id}`)
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    blocks: toBlocks(row.blocks),
    origin: row.origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Every template saved in a pond, by name. A fresh pond returns [] — the twelve
 * premade shapes are code constants (#155), never rows.
 */
export async function listTemplates(
  supabase: SupabaseClient<Database>,
  userId: string,
  /** #312: scope to one pond; omitted reads across ponds (`s6m5`). */
  pondId?: string | null
): Promise<PondTemplate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any).from('templates').select(TEMPLATE_COLUMNS).eq('user_id', userId)
  // Conditional: `.eq('pond_id', null)` would match only rows with NO pond.
  if (pondId) q = q.eq('pond_id', pondId)
  const { data, error } = await q.order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as TemplateRow[]).map(mapRow)
}

/** A single template by id, or null if it doesn't exist. */
export async function getTemplate(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<PondTemplate | null> {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapRow(data as TemplateRow) : null
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Save a new template. One insert, no retry: a same-pond name collision raises
 * {@link DuplicateTemplateNameError} for the caller to surface. (Contrast
 * `createPage`, which auto-suffixes " 2", " 3" — a template name is chosen by
 * the person and is theirs to resolve.)
 */
export async function createTemplate(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateTemplateInput
): Promise<PondTemplate> {
  // #312/B4: stamp the pond. `listTemplates` filters on it, so an unstamped
  // template is invisible in every pond — saved, and gone.
  //
  // KAN-10: resolving an absent pond here rather than writing null is the same
  // guard `createPage` already makes, and for the same reason. It is not
  // theoretical: a `?pond=` naming a pond that has since been DELETED makes
  // `resolveActivePond` return null by design (it never substitutes another
  // pond silently), so the whole shell runs unscoped and every caller hands us
  // null. Writing it through produced two invisible rows — and, because NULLs
  // are distinct in a unique index, `templates_name_uniq` could not even catch
  // them as duplicates of each other.
  const pondId = input.pondId ?? (await firstPondId(supabase, userId))

  const insert = {
    user_id: userId,
    ...(pondId ? { pond_id: pondId } : {}),
    name: input.name.trim(),
    kind: input.kind,
    blocks: input.blocks ?? [],
    origin: input.origin ?? 'yours',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('templates')
    .insert(insert)
    .select(TEMPLATE_COLUMNS)
    .single()

  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateTemplateNameError(input.name.trim())
    throw new Error(error.message ?? 'Failed to create template')
  }
  if (!data) throw new Error('Failed to create template')
  return mapRow(data as TemplateRow)
}

/**
 * Rename a template. A collision with another template in the pond raises
 * {@link DuplicateTemplateNameError}; nothing is suffixed.
 */
export async function renameTemplate(
  supabase: SupabaseClient<Database>,
  id: string,
  name: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('templates')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateTemplateNameError(name.trim())
    throw new Error(error.message)
  }
}

/**
 * Overwrite a template's entire block array. Like a page's blocks, never
 * partially updated — the whole array is written on save. Pages already made
 * from this template are untouched: they hold a copy, not a reference.
 */
export async function saveTemplateBlocks(
  supabase: SupabaseClient<Database>,
  id: string,
  blocks: Block[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('templates')
    .update({ blocks, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * Delete a template. Single-table: there is no FK from `pages` and no
 * application-side sweep, so every page carrying its provenance stamp stays
 * byte-identical (proved in schema-invariants.pglite.test.ts).
 */
export async function deleteTemplate(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('templates').delete().eq('id', id)

  if (error) throw new Error(error.message)
}
