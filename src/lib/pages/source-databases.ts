/**
 * What the host hands the source picker (#280) — pure over the flat `['pages']`
 * rows, so the list is unit-testable without React or Supabase, and so every
 * value on a row comes from the owner that already derives it:
 *
 *   which pages are databases   the children of the databases root, through the
 *                               one `isDatabasesRoot` predicate (`Pond 02` 2e:
 *                               "anything already in databases is one row down";
 *                               the same reading the palette's `database` kind uses)
 *   how many records each holds `fetchRecordCounts` — ONE query over the pond's
 *                               `type='row'` pages, counted by parent, because the
 *                               lean `['pages']` tree excludes rows entirely
 *   records are pages or rows   `'pages'` — the engine has one record shape today
 *                               (a `row` is an openable page, `properties/schema.ts`);
 *                               the seg's `rows only` rides the pick result until
 *                               the engine carries it
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import type { PageRow } from '@/lib/pages/tree'
import { isDatabasesRoot } from '@/lib/pages/databases-root'
import { ROW_TYPE } from '@/lib/properties/schema'
import type { SourceDatabase } from '@/components/molecules/source-entries'

/** Records per database — a map from the collection page's id to its `row` count. */
export type RecordCounts = ReadonlyMap<string, number>

/** The pond's databases: the databases root's children, in rail order. */
export function databasesOf(rows: readonly PageRow[]): PageRow[] {
  const root = rows.find((r) => isDatabasesRoot({ parentId: r.parent_id, title: r.title }))
  if (!root) return []
  return rows.filter((r) => r.parent_id === root.id).sort((a, b) => a.order - b.order)
}

/** The picker's rows: each database with its count. */
export function sourceDatabases(rows: readonly PageRow[], counts: RecordCounts): SourceDatabase[] {
  return databasesOf(rows).map((r) => ({
    id: r.id,
    title: r.title || 'Untitled',
    records: counts.get(r.id) ?? 0,
    recordsAre: 'pages',
  }))
}

/**
 * How many records every database holds, in one request: the pond's `type='row'`
 * pages by `parent_id`, counted here. Rows are the only column read, so the
 * response is one short string per record (AUDIT G7 — volume — is noted: a pond
 * with tens of thousands of records would want a server-side count).
 */
export async function fetchRecordCounts(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspace: WorkspaceScope = 'main'
): Promise<RecordCounts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pages')
    .select('parent_id')
    .eq('user_id', userId)
    .eq('workspace', workspace)
    .eq('type', ROW_TYPE)
  if (error) throw new Error(error.message)
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as { parent_id: string | null }[]) {
    if (!r.parent_id) continue
    counts.set(r.parent_id, (counts.get(r.parent_id) ?? 0) + 1)
  }
  return counts
}
