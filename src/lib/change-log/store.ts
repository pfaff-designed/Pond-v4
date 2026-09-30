/**
 * The change-log store (issue #102, spec #110 — direction LOCKED = Option A).
 *
 * The ONLY write path into `public.change_log`. Every function here either
 * INSERTS a record or ADVANCES one record's status; there is deliberately no
 * delete, no before/after rewrite, and no way to replace a transition. That is
 * the design's law — "the log only grows" — and it is enforced three deep:
 *
 *   1. here, in the typed API (no delete verb exists on this module);
 *   2. in `status.ts`, which refuses an illegal status edge before the update
 *      is even issued;
 *   3. in migration 0011, whose `change_log_append_only` trigger raises on
 *      DELETE and on any rewrite of identity or diff content, and whose RLS
 *      grants select/insert/update but has NO delete policy.
 *
 * Revise, revert, undo and redo are therefore NOT updates: each inserts a new
 * record that links back through `links`, so the chain stays walkable and
 * history is never touched.
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js and no React. Follows
 * the repo's cast-to-any pattern on insert/update chains (the generated builder
 * types don't narrow through them).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { assertTransition, canRevise } from './status'
import {
  ACTOR_YOU,
  isChangeLogStatus,
  type ChangeLogAction,
  type ChangeLogActor,
  type ChangeLogLinks,
  type ChangeLogRecord,
  type ChangeLogRow,
  type ChangeLogStatus,
  type ChangeLogTransition,
} from './types'

const TABLE = 'change_log'

const COLUMNS =
  'id, user_id, workspace, status, action, actor, target_page_id, target_block_id, before, after, source_thread_id, tool_call_id, read, links, transitions, created_at, status_at'

// ── Row ↔ record mapping ─────────────────────────────────────────────────────

function readLinks(value: unknown): ChangeLogLinks {
  if (typeof value !== 'object' || value === null) return {}
  const v = value as Record<string, unknown>
  const out: ChangeLogLinks = {}
  const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined)
  const revertOf = str(v.revert_of ?? v.revertOf)
  const revisedFrom = str(v.revised_from ?? v.revisedFrom)
  const undoOf = str(v.undo_of ?? v.undoOf)
  const redoOf = str(v.redo_of ?? v.redoOf)
  if (revertOf) out.revertOf = revertOf
  if (revisedFrom) out.revisedFrom = revisedFrom
  if (undoOf) out.undoOf = undoOf
  if (redoOf) out.redoOf = redoOf
  return out
}

/** Persisted snake_case shape of {@link ChangeLogLinks}. */
function writeLinks(links: ChangeLogLinks | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!links) return out
  if (links.revertOf) out.revert_of = links.revertOf
  if (links.revisedFrom) out.revised_from = links.revisedFrom
  if (links.undoOf) out.undo_of = links.undoOf
  if (links.redoOf) out.redo_of = links.redoOf
  return out
}

function readTransitions(value: unknown): ChangeLogTransition[] {
  if (!Array.isArray(value)) return []
  const out: ChangeLogTransition[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (!isChangeLogStatus(e.status)) continue
    out.push({
      status: e.status,
      at: typeof e.at === 'string' ? e.at : '',
      actor: typeof e.actor === 'string' ? e.actor : ACTOR_YOU,
    })
  }
  return out
}

/** Map a raw row to the application shape. Tolerant: a malformed `links` or
 *  `transitions` degrades to empty rather than throwing a whole view away. */
export function mapChangeLogRow(row: ChangeLogRow): ChangeLogRecord {
  if (!isChangeLogStatus(row.status)) {
    // The DB CHECK makes this unreachable; if it ever fires, the row is from a
    // future migration this build doesn't understand — say so loudly.
    throw new Error(`change log: unknown status '${row.status}' on record ${row.id}`)
  }
  return {
    id: row.id,
    userId: row.user_id,
    workspace: row.workspace,
    status: row.status,
    action: row.action as ChangeLogAction,
    actor: row.actor,
    targetPageId: row.target_page_id,
    targetBlockId: row.target_block_id,
    before: row.before ?? null,
    after: row.after ?? null,
    sourceThreadId: row.source_thread_id,
    toolCallId: row.tool_call_id,
    read: row.read ?? null,
    links: readLinks(row.links),
    transitions: readTransitions(row.transitions),
    createdAt: row.created_at,
    statusAt: row.status_at,
  }
}

// ── Appends ──────────────────────────────────────────────────────────────────

/** Everything an append needs. `status` is the status the record is BORN with —
 *  `proposed` for anything awaiting a decision, `accepted` for a person's own
 *  edit (which applies as they type). */
export interface AppendRecordInput {
  userId: string
  workspace?: WorkspaceScope
  status: ChangeLogStatus
  action: ChangeLogAction
  actor?: ChangeLogActor
  targetPageId?: string | null
  targetBlockId?: string | null
  before?: unknown
  after?: unknown
  sourceThreadId?: string | null
  toolCallId?: string | null
  read?: unknown
  links?: ChangeLogLinks
}

/**
 * Insert one record. The birth status is stamped as the first entry of the
 * append-only `transitions` audit, so a record's whole history reads off one
 * column no matter how it was born.
 */
export async function appendRecord(
  supabase: SupabaseClient<Database>,
  input: AppendRecordInput
): Promise<ChangeLogRecord> {
  const now = new Date().toISOString()
  const actor = input.actor ?? ACTOR_YOU
  const insert = {
    user_id: input.userId,
    workspace: input.workspace ?? 'main',
    status: input.status,
    action: input.action,
    actor,
    target_page_id: input.targetPageId ?? null,
    target_block_id: input.targetBlockId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    source_thread_id: input.sourceThreadId ?? null,
    tool_call_id: input.toolCallId ?? null,
    read: input.read ?? null,
    links: writeLinks(input.links),
    transitions: [{ status: input.status, at: now, actor }],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert(insert)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return mapChangeLogRow(data as ChangeLogRow)
}

/**
 * Pond's side of the diff model: anything Pond, an agent, or a sharer wants to
 * change arrives as a `proposed` record carrying the full before/after snapshot
 * captured AT PROPOSE TIME — not just a decision (spec #110 criterion 2).
 */
export async function appendProposal(
  supabase: SupabaseClient<Database>,
  input: Omit<AppendRecordInput, 'status'>
): Promise<ChangeLogRecord> {
  return appendRecord(supabase, { actor: 'pond', ...input, status: 'proposed' })
}

/**
 * A person's own typed edit. The design: "Your own edits are accepted as you
 * make them (logged with status accepted, by you)" — they never sit as
 * proposals (spec #110 criterion 7). Grouping-by-pause is the caller's job (the
 * editor debounce decides when one edit ends); this records what it is handed.
 */
export async function appendOwnEdit(
  supabase: SupabaseClient<Database>,
  input: Omit<AppendRecordInput, 'status' | 'actor'>
): Promise<ChangeLogRecord> {
  return appendRecord(supabase, { ...input, status: 'accepted', actor: ACTOR_YOU })
}

/**
 * Answer a `changes_requested` or `outdated` record with a fresh proposal. The
 * original is NOT touched — the two "stay as linked records, in order" via
 * `links.revisedFrom`.
 */
export async function reviseRecord(
  supabase: SupabaseClient<Database>,
  original: ChangeLogRecord,
  input: Omit<AppendRecordInput, 'status' | 'links' | 'userId'> & { userId?: string }
): Promise<ChangeLogRecord> {
  if (!canRevise(original.status)) {
    throw new Error(
      `change log: record ${original.id} is '${original.status}' — only a changes_requested or outdated record is revised`
    )
  }
  return appendProposal(supabase, {
    userId: original.userId,
    workspace: original.workspace,
    ...input,
    links: { revisedFrom: original.id },
  })
}

// ── Advances ─────────────────────────────────────────────────────────────────

/** Read one record by id (null when it isn't there / isn't visible). */
export async function getRecord(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<ChangeLogRecord | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from(TABLE).select(COLUMNS).eq('id', id).maybeSingle()
  return data ? mapChangeLogRow(data as ChangeLogRow) : null
}

/**
 * Advance one record's status. The ONLY mutation this module performs, and it
 * touches exactly three columns: `status`, `status_at`, and one APPENDED entry
 * on `transitions`. The edge is asserted against the state machine first, so an
 * illegal advance (accepting an outdated record, re-deciding a settled one)
 * throws before any write.
 *
 * Note the read-then-write: `transitions` is appended client-side because
 * PostgREST has no jsonb-concat verb. The DB trigger is the backstop — it
 * refuses any update that SHRINKS the array, so a lost-update race can drop an
 * entry but can never erase history.
 */
export async function advanceStatus(
  supabase: SupabaseClient<Database>,
  id: string,
  to: ChangeLogStatus,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<ChangeLogRecord> {
  const current = await getRecord(supabase, id)
  if (!current) throw new Error(`change log: record ${id} not found`)
  // Legality lives here, in one place, in TypeScript — spec #110 §3 puts the
  // state machine in the write layer, and a copy of it in SQL would only drift.
  assertTransition(current.status, to)

  // The WRITE goes through a compare-and-swap RPC that appends in SQL on a locked
  // row. Reading the record and writing `[...transitions, next]` back from the
  // application lost a concurrent advance's entry outright: both readers saw one
  // entry, both wrote two, and the second erased the first — a lost update in the
  // one table whose whole promise is that it only grows. Passing the status we
  // believe we are leaving turns that race into a loud conflict.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('advance_change_log_record', {
    p_record_id: id,
    p_from: current.status,
    p_to: to,
    p_actor: actor,
  })
  if (error) throw error
  return mapChangeLogRow(data as ChangeLogRow)
}

/** Decline a proposal outright. */
export async function rejectRecord(
  supabase: SupabaseClient<Database>,
  id: string,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<ChangeLogRecord> {
  return advanceStatus(supabase, id, 'rejected', actor)
}

/** Send a note back to the proposer; they answer with {@link reviseRecord}. */
export async function requestChanges(
  supabase: SupabaseClient<Database>,
  id: string,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<ChangeLogRecord> {
  return advanceStatus(supabase, id, 'changes_requested', actor)
}

/** The proposer pulls their own proposal. NOT what happens at session close —
 *  the design keeps unresolved proposals waiting, it never silently withdraws
 *  them (spec #110 §4). */
export async function withdrawRecord(
  supabase: SupabaseClient<Database>,
  id: string,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<ChangeLogRecord> {
  return advanceStatus(supabase, id, 'withdrawn', actor)
}

/**
 * Accept a proposal AND commit its page write in ONE transaction, through the
 * `accept_change_log_record` function from migration 0011. Two PostgREST calls
 * could leave an accepted record with no committed block (or the reverse); a
 * single function call cannot (spec #110 criterion 3). Raises — and rolls the
 * page write back with it — if the record is not `proposed` or its page is gone.
 */
export async function acceptRecord(
  supabase: SupabaseClient<Database>,
  id: string,
  blocks: unknown,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<ChangeLogRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('accept_change_log_record', {
    p_record_id: id,
    p_blocks: blocks,
    p_actor: actor,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error(`change log: accept of record ${id} returned no record`)
  return mapChangeLogRow(row as ChangeLogRow)
}

/**
 * G2 — the outdated sweep. When a diff is accepted, every OTHER still-`proposed`
 * record aimed at the same blocks was written against a state that no longer
 * exists, so it goes `outdated`: its accept affordance is withdrawn and revise
 * is offered instead (spec #110 criterion 5).
 *
 * `blockIds` empty means "the whole page moved on" — every proposed record on
 * that page is swept. Returns the records that were advanced.
 */
export async function markOutdated(
  supabase: SupabaseClient<Database>,
  opts: {
    userId: string
    workspace?: WorkspaceScope
    targetPageId: string
    /** Blocks the accepted diff touched. Empty ⇒ sweep the whole page. */
    blockIds?: string[]
    /** The record that was just accepted — never sweeps itself. */
    exceptId?: string
    actor?: ChangeLogActor
  }
): Promise<ChangeLogRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', opts.userId)
    .eq('workspace', opts.workspace ?? 'main')
    .eq('target_page_id', opts.targetPageId)
    .eq('status', 'proposed')
  // Taking only `data` made a failed query indistinguishable from "nothing to
  // sweep" — and this runs AFTER the accept has committed, so the sweep quietly
  // evaporating leaves accept-able proposals aimed at a block that has moved on,
  // which is the exact state `outdated` exists to prevent.
  if (error) throw error
  const rows = ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)

  const blockIds = opts.blockIds ?? []
  const stale = rows.filter((r) => {
    if (r.id === opts.exceptId) return false
    if (blockIds.length === 0) return true
    // A page-level proposal (no block) is stale whenever the page moves on.
    return r.targetBlockId === null || blockIds.includes(r.targetBlockId)
  })

  const out: ChangeLogRecord[] = []
  for (const record of stale) {
    out.push(await advanceStatus(supabase, record.id, 'outdated', opts.actor ?? 'pond'))
  }
  return out
}

/**
 * Deleting a memory note removes its CONTENT from the log — "the record keeps
 * only 'a note was deleted, by whom'" (spec #110 criterion 8). The record
 * itself survives, and this is the one mutation the append-only trigger admits:
 * `before`/`after` may be cleared to null, never replaced with different
 * content. Status is untouched — a redacted note is still whatever it was.
 */
export async function redactRecordContent(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<ChangeLogRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .update({ before: null, after: null })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return mapChangeLogRow(data as ChangeLogRow)
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Filters behind the log's saved views (all / proposed / by page / …). */
export interface ListRecordsOptions {
  userId: string
  workspace?: WorkspaceScope
  status?: ChangeLogStatus | ChangeLogStatus[]
  targetPageId?: string
  action?: ChangeLogAction | ChangeLogAction[]
  sourceThreadId?: string
  limit?: number
}

/**
 * A pond's log, newest first — the shape every change-log view reads. Always
 * scoped to (`user_id`, `workspace`), so a record in one pond can never surface
 * in another (spec #110 criterion 11).
 */
export async function listRecords(
  supabase: SupabaseClient<Database>,
  opts: ListRecordsOptions
): Promise<ChangeLogRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', opts.userId)
    .eq('workspace', opts.workspace ?? 'main')
  if (opts.status !== undefined) {
    q = Array.isArray(opts.status) ? q.in('status', opts.status) : q.eq('status', opts.status)
  }
  if (opts.action !== undefined) {
    q = Array.isArray(opts.action) ? q.in('action', opts.action) : q.eq('action', opts.action)
  }
  if (opts.targetPageId !== undefined) q = q.eq('target_page_id', opts.targetPageId)
  if (opts.sourceThreadId !== undefined) q = q.eq('source_thread_id', opts.sourceThreadId)
  q = q.order('created_at', { ascending: false })
  if (opts.limit !== undefined) q = q.limit(opts.limit)

  const { data } = await q
  return ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)
}

/**
 * The figure the change log is led by: "N proposed, waiting on you." Counts the
 * pond's still-open records — the exact set `listRecords({status:'proposed'})`
 * returns (spec #110 criterion 9).
 */
export async function countProposed(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspace: WorkspaceScope = 'main'
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('workspace', workspace)
    .eq('status', 'proposed')
  return count ?? 0
}

/**
 * Walk a record's revision chain forward — original → revision → revision …
 * following `links.revisedFrom` in the other direction. The record page shows
 * these "as linked records, in order".
 */
export async function listRevisionsOf(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; recordId: string }
): Promise<ChangeLogRecord[]> {
  const all = await listRecords(supabase, { userId: opts.userId, workspace: opts.workspace })
  const byRevisedFrom = new Map<string, ChangeLogRecord>()
  for (const r of all) {
    if (r.links.revisedFrom) byRevisedFrom.set(r.links.revisedFrom, r)
  }
  const chain: ChangeLogRecord[] = []
  const seen = new Set<string>([opts.recordId])
  let cursor = opts.recordId
  for (;;) {
    const next = byRevisedFrom.get(cursor)
    if (!next || seen.has(next.id)) break
    chain.push(next)
    seen.add(next.id)
    cursor = next.id
  }
  return chain
}
