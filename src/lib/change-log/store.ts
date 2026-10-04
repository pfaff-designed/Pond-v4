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
import { jsonEqual } from './revert-plan'
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
/**
 * The common read prefix, with the pond filter applied ONLY when there is a pond
 * (#312).
 *
 * `Pond 06.13` `s6m5`: "pages, databases, memory, threads and **the change log**
 * are per pond. Nothing crosses over." Without the filter, the proposed view
 * showed every pond's diffs in every pond.
 *
 * Conditional for a reason worth naming: `.eq('pond_id', null)` matches only the
 * rows that have NO pond, which is the exact opposite of "read across ponds". A
 * first attempt at this did precisely that, so the condition lives here once
 * rather than at six call sites.
 */
function readScoped(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; pondId?: string | null },
  select: string = COLUMNS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectOpts?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from(TABLE)
    .select(select, selectOpts)
    .eq('user_id', opts.userId)
    .eq('workspace', opts.workspace ?? 'main')
  if (opts.pondId) q = q.eq('pond_id', opts.pondId)
  return q
}

export interface AppendRecordInput {
  userId: string
  workspace?: WorkspaceScope
  /** #312: the pond this record belongs to. Unstamped, it escapes every filter. */
  pondId?: string | null
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
    ...(input.pondId ? { pond_id: input.pondId } : {}),
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
 * The record a given tool call produced, or null when there isn't one.
 *
 * This is the transcript → log bridge the accept and reject paths need. A
 * proposal is logged server-side as the call is emitted (`propose.ts`), keyed by
 * `tool_call_id`; the browser later resolves that same card and knows only the
 * tool call id, so this is how it finds the record to advance. Scoped to the pond
 * like every other read, so a tool call id can never reach across workspaces.
 *
 * Null is an ordinary answer, not an error: a card streamed before this build
 * shipped, or one whose log write was dropped (the log is a side-record and
 * `recordProposedToolCalls` never throws), has no record to advance.
 */
export async function getRecordByToolCall(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; pondId?: string | null; toolCallId: string }
): Promise<ChangeLogRecord | null> {
  const { data, error } = await readScoped(supabase, opts)
    .eq('tool_call_id', opts.toolCallId)
    .maybeSingle()
  // Taking only `data` made a broken query indistinguishable from "this call was
  // never logged" — and callers read null as "nothing to advance", so a transient
  // failure would skip the advance with no trace. Same reasoning as the sweep.
  if (error) throw error
  return data ? mapChangeLogRow(data as ChangeLogRow) : null
}

/**
 * The records behind a SET of tool calls, in one query (#98). The terminal
 * reads its open cards back through this so a record the log has moved past —
 * swept `outdated` when the target page was edited (G2), or withdrawn — reaches
 * the card. Scoped to the pond like every other read. Raises on a failed query
 * for the same reason `getRecordByToolCall` does.
 */
export async function listRecordsByToolCalls(
  supabase: SupabaseClient<Database>,
  opts: {
    userId: string
    workspace?: WorkspaceScope
    pondId?: string | null
    toolCallIds: readonly string[]
  }
): Promise<ChangeLogRecord[]> {
  if (opts.toolCallIds.length === 0) return []

  const { data, error } = await readScoped(supabase, opts).in('tool_call_id', [...opts.toolCallIds])
  if (error) throw error
  return ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)
}

/**
 * Advance one record's status. The ONLY mutation this module performs, and it
 * touches exactly three columns: `status`, `status_at`, and one APPENDED entry
 * on `transitions`. The edge is asserted against the state machine first, so an
 * illegal advance (accepting an outdated record, re-deciding a settled one)
 * throws before any write.
 *
 * The append happens in SQL, not here: `advance_change_log_record` locks the row
 * and concatenates the entry, under a compare-and-swap on the status this call
 * believes it is leaving. Appending client-side is what let two concurrent
 * advances each read one entry, each write two, and the second erase the first.
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
    /** #312: scope to one pond; omitted reads across ponds. */
    pondId?: string | null
    targetPageId: string
    /** Blocks the accepted diff touched. Empty ⇒ sweep the whole page. */
    blockIds?: string[]
    /** The record that was just accepted — never sweeps itself. */
    exceptId?: string
    /** Only these actions. A block write outdates block diffs; it says nothing
     *  about a pending `add_row` or `define_schema` on the same page, whose
     *  before/after live in the property schema and rows instead. */
    actions?: ChangeLogAction[]
    /**
     * The page's blocks as they NOW stand (#98 review): a record whose `before`
     * snapshot still equals them is aimed at a page that has not actually moved,
     * so it stays applicable.
     *
     * Needed because a page write is not the same thing as a block change. The
     * editor's debounced save commits the whole page — title included — so
     * renaming a page runs this sweep with byte-identical blocks. Without this
     * guard a rename outdates every pending diff on the page, and `outdated` is
     * one-way: it drops accept, so the person loses the diff for typing in the
     * title field. Compared with `jsonEqual`, not `JSON.stringify`, because JSONB
     * round-trips object keys in its own order.
     *
     * Omit to sweep on the write alone (the accept path, which knows the blocks
     * changed because it just changed them).
     */
    pageBlocks?: unknown
    actor?: ChangeLogActor
  }
): Promise<ChangeLogRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = readScoped(supabase, opts)
    .eq('target_page_id', opts.targetPageId)
    .eq('status', 'proposed')
  if (opts.actions !== undefined) q = q.in('action', opts.actions)
  const { data, error } = await q
  // Taking only `data` made a failed query indistinguishable from "nothing to
  // sweep" — and this runs AFTER the accept has committed, so the sweep quietly
  // evaporating leaves accept-able proposals aimed at a block that has moved on,
  // which is the exact state `outdated` exists to prevent.
  if (error) throw error
  const rows = ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)

  const blockIds = opts.blockIds ?? []
  const stale = rows.filter((r) => {
    if (r.id === opts.exceptId) return false
    // The target did not move: the blocks this record was written against are
    // still exactly the page's blocks. A title-only save lands here.
    if (opts.pageBlocks !== undefined && jsonEqual(r.before, opts.pageBlocks)) return false
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
  /** #312: scope to one pond; omitted reads across ponds. */
  pondId?: string | null
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
  let q: any = readScoped(supabase, opts)
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
  workspace: WorkspaceScope = 'main',
  /** #312: the pond whose open records to count. Omitted, counts across ponds. */
  pondId?: string | null
): Promise<number> {
  const { count } = await readScoped(supabase, { userId, workspace, pondId }, 'id', {
    count: 'exact',
    head: true,
  }).eq('status', 'proposed')
  return count ?? 0
}

/**
 * The records that propose reverting `recordId` — the design's `reverted by`
 * field, and the guard against raising a second revert of the same change while
 * one is still waiting (#103).
 *
 * Queried through `links->>revert_of` because the backlink is DERIVED: 0011
 * freezes `links` at insert, so the original never gains a pointer to its revert.
 * Sits beside {@link listRevisionsOf} — both walk the link chain, and every
 * `change_log` query belongs in this module.
 */
export async function listRevertsOf(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; pondId?: string | null; recordId: string }
): Promise<ChangeLogRecord[]> {
  const { data, error } = await readScoped(supabase, opts)
    .eq('links->>revert_of', opts.recordId)
    .order('created_at', { ascending: false })
  // A failed query read as "no reverts yet" would let a second revert be raised
  // over one already waiting, and would blank the `reverted by` field without
  // saying why. Same reasoning as the sweep and `getRecordByToolCall`.
  if (error) throw error
  return ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)
}

/**
 * Walk a record's revision chain forward — original → revision → revision …
 * following `links.revisedFrom` in the other direction. The record page shows
 * these "as linked records, in order".
 */
export async function listRevisionsOf(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; pondId?: string | null; recordId: string }
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
