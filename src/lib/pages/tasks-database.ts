/**
 * The pond's ONE shared tasks database (KAN-536, `AUDIT.md` 2026-10-24 ruling):
 * every project board is a filtered view of this one database, never a database
 * of its own. Looked up by role (`props._role: 'tasks'`), never by title — a
 * database titled "tasks" by hand is an ordinary database and is never picked.
 *
 * `props._role` is optional JSON: absent means an ordinary database, so every
 * database that predates this ticket reads unchanged (the user's existing Life /
 * Life 2-4 / Bugs databases stay exactly as they are, per comment 10435).
 *
 * Exactly one role database per pond. Two is an impossible state the writer
 * itself never produces (`getOrCreateTasksDatabase` always reuses an existing
 * one) — `pickTasksDatabase` only has to cope with it because a trashed role
 * database can be restored alongside the replacement `/board` already made.
 *
 * Framework-agnostic — takes a SupabaseClient, exercised directly in jest.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { defaultFieldsFor, type SourceField } from '@/components/molecules/source-entries'
import { createDatabase } from '@/lib/pages/create-database'
import { defineSchema } from '@/lib/pages/client'
import { inPond, resolvePond } from '@/lib/pond/scope'
import { readSchema, type PropertyDef, type PropertySchema } from '@/lib/properties/schema'
import { appendOwnEdit } from '@/lib/change-log/store'

/** The one role this ticket mints. A string, not an enum: no other role exists yet. */
export const TASKS_ROLE = 'tasks' as const

/**
 * The tasks database's starting fields: a board's own defaults (KAN-351) —
 * status lanes, done, due, repeats, assignee — plus `project`, the tag a task
 * belongs to its board through (user ruling, comment 10435: a tag, not a
 * relation). Composed from `defaultFieldsFor('board')` rather than restating its
 * five fields, so the board's own defaults and the tasks database's never drift
 * apart.
 */
export const TASKS_FIELDS: SourceField[] = [
  ...defaultFieldsFor('board'),
  { name: 'project', type: 'select' },
]

/** The columns {@link pickTasksDatabase} and {@link getOrCreateTasksDatabase} read off a page row. */
export interface TasksDatabaseRow {
  id: string
  props: Record<string, unknown>
  created_at: string
}

/**
 * Which of a pond's pages IS the shared tasks database, by role — never by
 * title, so an ordinary database a person happened to call "tasks" is never
 * mistaken for it. Exactly one is the database's own invariant; this only
 * copes with the impossible state because a trashed role row is invisible
 * (RLS) and so can be duplicated by a restore. In development that duplicate
 * throws (AGENTS.md "crash early"); in production it is logged and the OLDEST
 * row wins, so the choice never flips between requests as rows reorder.
 */
export function pickTasksDatabase(rows: readonly TasksDatabaseRow[]): TasksDatabaseRow | null {
  const roleRows = rows.filter((r) => r.props._role === TASKS_ROLE)
  if (roleRows.length === 0) return null
  if (roleRows.length === 1) return roleRows[0]
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      `Found ${roleRows.length} tasks-role databases in one pond — expected at most one.`
    )
  }
  console.error(
    `Found ${roleRows.length} tasks-role databases in one pond; falling back to the oldest.`,
    roleRows.map((r) => r.id)
  )
  return [...roleRows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
}

/**
 * The tasks database's `project` field — select or status, named "project"
 * (trimmed, case-insensitive) — or `undefined` when no field of that name
 * and kind exists. Checked by kind as well as name: a `project` field the
 * person retyped to `text` cannot hold an option, so it is read as absent
 * here rather than mistaken for the real one (KAN-536) — a board over it
 * would otherwise land unfiltered, showing every project. The one home for
 * this lookup; `BlockCanvas.tsx` imports it rather than repeating the match.
 */
export function projectFieldOf(schema: PropertySchema): PropertyDef | undefined {
  return schema.find(
    (f) => (f.type === 'select' || f.type === 'status') && f.name.trim().toLowerCase() === 'project'
  )
}

/** {@link SourceField}s minted into a real `PropertyDef[]` — same shape `BlockCanvas`'s
 *  `onSourcePick` mints for the picker's own `new` step. */
function toPropertySchema(fields: readonly SourceField[]): PropertySchema {
  return fields.map((f) => ({
    id: crypto.randomUUID(),
    name: f.name,
    type: f.type,
    ...(f.options ? { options: f.options.map((o) => ({ id: crypto.randomUUID(), label: o.label })) } : {}),
  }))
}

/**
 * The pond's tasks database — found by role, or created on first use with
 * {@link TASKS_FIELDS}. A role database found with no usable `project` field
 * — removed by hand, or retyped to something that cannot hold an option, like
 * `text` ({@link projectFieldOf}) — gets a proper `select` one added back as
 * an own edit rather than throwing: the lookup degrades, it never fails the
 * board a person is trying to open.
 */
export async function getOrCreateTasksDatabase(
  supabase: SupabaseClient<Database>,
  pondId: string | null
): Promise<{ id: string; schema: PropertySchema }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const pond = await resolvePond(supabase, user.id, pondId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = (supabase as any)
    .from('pages')
    .select('id, props, created_at')
    .eq('user_id', user.id)
  const { data, error } = await inPond(q, pond)
  if (error) throw new Error(error.message)

  const picked = pickTasksDatabase((data ?? []) as TasksDatabaseRow[])
  if (picked) {
    const schema = readSchema(picked.props) ?? []
    if (projectFieldOf(schema)) {
      return { id: picked.id, schema }
    }
    const withProject: PropertySchema = [
      ...schema,
      { id: crypto.randomUUID(), name: 'project', type: 'select' },
    ]
    await defineSchema(supabase, picked.id, withProject)
    try {
      await appendOwnEdit(supabase, {
        userId: user.id,
        pondId,
        action: 'edit_schema',
        targetPageId: picked.id,
        before: schema,
        after: withProject,
      })
    } catch (err) {
      console.error('[change-log] schema edit not logged', picked.id, err)
    }
    return { id: picked.id, schema: withProject }
  }

  const schema = toPropertySchema(TASKS_FIELDS)
  const made = await createDatabase(
    supabase,
    { title: 'tasks', schema, pondId, role: TASKS_ROLE },
    () => crypto.randomUUID()
  )
  return { id: made.databaseId, schema }
}
