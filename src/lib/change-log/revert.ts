/**
 * Revert-as-new-diff (issue #103, spec #110 — direction LOCKED = Option A).
 *
 * Design law, storyboard `Pond 06.15 Change log.dc.html` frame 4: "Revert doesn't
 * rewrite history. It adds a new proposed diff that sets the block back, and links
 * the two records." — "revert goes through accept like any change", and "any
 * accepted record can be reverted. If the block has moved on, the revert arrives
 * outdated and Pond offers a revision."
 *
 * WHEN THE ORIGINAL BECOMES `reverted`. Not here. Frame 4's record page is a field
 * grid whose two rows are `status → accepted by you · 09:31` and `reverted by →
 * revert · 10:02 [proposed]`. `reverted by` is a FIELD LABEL, not a transition: the
 * original still reads `accepted` while its revert is merely proposed, and the pill
 * is the REVERT record's status. So the original advances `accepted → reverted` only
 * when the revert is accepted — which is also the only coherent reading, since
 * `reverted` is terminal in `status.ts` and a rejected revert must leave the
 * original standing. That advance rides inside `accept_revert_record` (0013).
 *
 * The `reverted by` backlink is DERIVED, never stored: migration 0011 freezes
 * `links` at insert ("adding a BACKlink to an existing record later would be a
 * deliberate migration, not an update"), so the revert carries `links.revertOf` and
 * the original is found by querying for it — {@link listRevertsOf}.
 *
 * WHAT CAN BE REVERTED, AND WHY ONLY THAT. `action: 'edit'` records only. They are
 * the only ones carrying a real before/after: `propose.ts` snapshots the target
 * page's full `Block[]` for `propose_changes` and stores the CALL (`before: null`)
 * for the other six tools, whose before/after live in a page's property schema and
 * rows rather than its blocks (#146 item 4, still open). A revert needs a `before`
 * to set back to, so the other six get no revert affordance at all rather than one
 * that cannot work.
 *
 * The planner is pure — no Supabase, no React. The store calls sit below it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { WorkspaceScope } from '@/lib/workspace/context'
import { advanceStatus, appendRecord, mapChangeLogRow, markOutdated } from './store'
import {
  ACTOR_YOU,
  BLOCK_ACTIONS,
  type ChangeLogRecord,
  type ChangeLogRow,
  type ChangeLogStatus,
} from './types'

// ── Snapshot reading ─────────────────────────────────────────────────────────

/**
 * Read a stored snapshot as blocks.
 *
 * Deliberately NOT `blockSchema.parse`. A snapshot is history: it was written by
 * whatever build was running at propose time, and a module whose schema has since
 * gained a field would fail validation now. Throwing away a revert over a schema
 * drift is worse than setting back the bytes that were actually there — the page
 * write re-validates on its own path anyway. So this checks only what the planner
 * relies on: an array of objects carrying a string `id`.
 */
export function readBlockSnapshot(value: unknown): Block[] | null {
  if (!Array.isArray(value)) return null
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    if (typeof (entry as { id?: unknown }).id !== 'string') return null
  }
  return value as Block[]
}

/**
 * Structural equality over JSON values. `JSON.stringify` would call two snapshots
 * different because JSONB round-trips object keys in its own order, which would
 * report every block as "moved on" and make every revert arrive `outdated`.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => jsonEqual(item, b[i]))
  }
  if (typeof a !== 'object') return false
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const aKeys = Object.keys(ao)
  const bKeys = Object.keys(bo)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(bo, key) && jsonEqual(ao[key], bo[key])
  )
}

function indexById(blocks: Block[]): Map<string, Block> {
  const map = new Map<string, Block>()
  for (const block of blocks) map.set(block.id, block)
  return map
}

// ── Can this record be reverted? ─────────────────────────────────────────────

/** Why a record offers no revert. `null` from {@link revertRefusal} means it does. */
export type RevertRefusal =
  'not-accepted' | 'not-an-edit' | 'no-snapshot' | 'no-target-page' | 'nothing-to-revert'

/** One short human line per refusal, for the panel. */
export const REVERT_REFUSALS: Readonly<Record<RevertRefusal, string>> = {
  'not-accepted': 'only an accepted change can be reverted',
  'not-an-edit': 'this kind of change cannot be set back yet',
  'no-snapshot': 'this record has no before/after to set back',
  'no-target-page': 'the page this applied to is gone',
  'nothing-to-revert': 'this change altered no blocks',
}

/**
 * Whether the log offers a revert on this record, judged from the record ALONE —
 * no page read. `null` means revert is offered.
 *
 * "Any accepted record can be reverted" is the design's rule; the narrowing to
 * `edit` is the honest limit of what is snapshotted today (see the header).
 */
export function revertRefusal(record: ChangeLogRecord): RevertRefusal | null {
  if (record.status !== 'accepted') return 'not-accepted'
  if (record.action !== 'edit') return 'not-an-edit'
  if (record.targetPageId === null) return 'no-target-page'
  const before = readBlockSnapshot(record.before)
  const after = readBlockSnapshot(record.after)
  if (before === null || after === null) return 'no-snapshot'
  if (touchedBlockIds(before, after).length === 0) return 'nothing-to-revert'
  return null
}

/** Can a revert be offered on this record? Sugar over {@link revertRefusal}. */
export function canRevertRecord(record: ChangeLogRecord): boolean {
  return revertRefusal(record) === null
}

// ── The plan ─────────────────────────────────────────────────────────────────

/**
 * The block ids the original record changed — the ones a revert sets back.
 *
 * Compared BY ID, not by position. A revert restores each touched block's content
 * and presence; it does not restore ORDERING, because a pure reorder leaves every
 * block byte-identical and there is no honest way to reimpose an old sequence on a
 * page that has gained and lost blocks since. A record that only reordered blocks
 * therefore reports `nothing-to-revert` rather than silently doing half the job.
 */
export function touchedBlockIds(before: Block[], after: Block[]): string[] {
  const beforeById = indexById(before)
  const afterById = indexById(after)
  const ids = new Set<string>([...beforeById.keys(), ...afterById.keys()])
  const touched: string[] = []
  for (const id of ids) {
    if (!jsonEqual(beforeById.get(id) ?? null, afterById.get(id) ?? null)) touched.push(id)
  }
  return touched
}

export interface RevertPlan {
  /** What the page would hold if this revert were accepted. */
  blocks: Block[]
  /** The blocks the original record changed — what this revert sets back. */
  touchedIds: string[]
  /** True when any touched block no longer matches the original's `after`. */
  movedOn: boolean
  /**
   * The status the revert record is BORN with. `outdated` when the block has moved
   * on — "the revert arrives outdated and Pond offers a revision" — which withdraws
   * its accept affordance through the ordinary `canAccept` rule, no special case.
   */
  status: Extract<ChangeLogStatus, 'proposed' | 'outdated'>
}

/**
 * Plan the revert of `record` against the page's blocks as they stand NOW.
 *
 * Only the blocks the original touched are set back; everything the page has gained
 * since is left exactly where it is. That is what "sets the block back" means — a
 * whole-page rollback to `record.before` would also silently undo every unrelated
 * edit made in between, which no part of the design asks for.
 *
 * Throws if the record offers no revert — callers gate on {@link revertRefusal}
 * first, and reaching here without it is a programming error, not a user one.
 */
export function planRevert(record: ChangeLogRecord, current: Block[]): RevertPlan {
  const refusal = revertRefusal(record)
  if (refusal !== null) {
    throw new Error(`change log: record ${record.id} cannot be reverted — ${refusal}`)
  }
  // Non-null by the guard above.
  const before = readBlockSnapshot(record.before) as Block[]
  const after = readBlockSnapshot(record.after) as Block[]

  const beforeById = indexById(before)
  const afterById = indexById(after)
  const currentById = indexById(current)
  const touchedIds = touchedBlockIds(before, after)
  const touched = new Set(touchedIds)

  // "If the block has moved on…" — measured against the original's OWN `after`,
  // which is the state it left the page in. Anything else editing those blocks
  // since (another accepted diff, or the person typing) makes this revert a diff
  // written against a page that no longer exists.
  const movedOn = touchedIds.some(
    (id) => !jsonEqual(currentById.get(id) ?? null, afterById.get(id) ?? null)
  )

  // Walk the CURRENT page, so untouched blocks keep their place and their content.
  const blocks: Block[] = []
  for (const block of current) {
    if (!touched.has(block.id)) {
      blocks.push(block)
      continue
    }
    const restored = beforeById.get(block.id)
    // Absent from `before` ⇒ the original created it ⇒ the revert removes it.
    if (restored !== undefined) blocks.push(restored)
  }

  // Blocks the original DELETED come back. Anchored after whichever of their
  // predecessors in `before` is still on the page, so a restored block lands back
  // among its neighbours rather than at the end; nothing left to anchor to means
  // the top. Best-effort by nature — the page has moved since.
  for (const block of before) {
    if (!touched.has(block.id)) continue
    if (afterById.has(block.id)) continue // not a delete
    if (currentById.has(block.id)) continue // already back
    const beforeIndex = before.findIndex((b) => b.id === block.id)
    let at = 0
    for (let i = beforeIndex - 1; i >= 0; i--) {
      const anchor = blocks.findIndex((b) => b.id === before[i].id)
      if (anchor !== -1) {
        at = anchor + 1
        break
      }
    }
    blocks.splice(at, 0, block)
  }

  return { blocks, touchedIds, movedOn, status: movedOn ? 'outdated' : 'proposed' }
}

// ── Store calls ──────────────────────────────────────────────────────────────

const TABLE = 'change_log'

const COLUMNS =
  'id, user_id, workspace, status, action, actor, target_page_id, target_block_id, before, after, source_thread_id, tool_call_id, read, links, transitions, created_at, status_at'

/**
 * The records that propose reverting `recordId` — the "reverted by" field of the
 * design's record page, and the guard against raising a second revert of the same
 * change while one is still waiting.
 *
 * Queried through `links->>revert_of` because the backlink is derived: 0011 freezes
 * `links` at insert, so the original never gains a pointer to its revert.
 */
export async function listRevertsOf(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; workspace?: WorkspaceScope; recordId: string }
): Promise<ChangeLogRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', opts.userId)
    .eq('workspace', opts.workspace ?? 'main')
    .eq('links->>revert_of', opts.recordId)
    .order('created_at', { ascending: false })
  // A failed query read as "no reverts yet" would let the caller raise a second
  // revert of a change that already has one waiting, and would blank the record
  // page's `reverted by` field without saying why.
  if (error) throw error
  return ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)
}

export interface ProposeRevertInput {
  userId: string
  workspace?: WorkspaceScope
  /** The accepted record being set back. */
  record: ChangeLogRecord
  /** The target page's blocks as they stand now. */
  current: Block[]
}

/**
 * Raise a revert: ONE new record, `action: 'revert'`, linked back through
 * `links.revertOf`. The original is not touched — "revert doesn't rewrite history".
 *
 * The new record's `before` is the page as it stands now and its `after` is the
 * planned result, so it is an ordinary diff that renders through the same registry
 * facets as any other and can be accepted through the same affordance.
 *
 * Raises when the record offers no revert, and when one is already waiting: a
 * second open revert of the same change would race the first, and accepting both
 * would advance the original twice — the state machine calls the second illegal,
 * so the person would meet a failure at accept time rather than at the click that
 * caused it.
 */
export async function proposeRevert(
  supabase: SupabaseClient<Database>,
  input: ProposeRevertInput
): Promise<ChangeLogRecord> {
  const { userId, record, current } = input
  const workspace = input.workspace ?? 'main'
  const refusal = revertRefusal(record)
  if (refusal !== null) {
    throw new Error(`change log: record ${record.id} cannot be reverted — ${refusal}`)
  }

  const existing = await listRevertsOf(supabase, { userId, workspace, recordId: record.id })
  if (existing.some((r) => r.status === 'proposed')) {
    throw new Error(`change log: record ${record.id} already has a revert waiting on you`)
  }

  const plan = planRevert(record, current)
  return appendRecord(supabase, {
    userId,
    workspace,
    status: plan.status,
    action: 'revert',
    // The person asked for it, so it is theirs — unlike a proposal, which is Pond's.
    actor: ACTOR_YOU,
    targetPageId: record.targetPageId,
    targetBlockId: record.targetBlockId,
    before: current,
    after: plan.blocks,
    sourceThreadId: record.sourceThreadId,
    links: { revertOf: record.id },
  })
}

/** What accepting a revert did. `outdated` is an ordinary outcome, not a failure. */
export type AcceptRevertResult =
  | { kind: 'accepted'; revert: ChangeLogRecord }
  /** The blocks moved on since the revert was raised — accept is withdrawn, revise
   *  is offered, and the revert has been advanced to `outdated`. */
  | { kind: 'outdated'; revert: ChangeLogRecord }

export interface AcceptRevertInput {
  userId: string
  workspace?: WorkspaceScope
  /** The `proposed` revert record being answered. */
  revert: ChangeLogRecord
  /** The record it reverts — `links.revertOf`, still `accepted`. */
  original: ChangeLogRecord
  /** The target page's blocks as they stand NOW. */
  current: Block[]
  actor?: string
}

/**
 * Accept a revert: commit the page, advance the revert to `accepted`, and advance
 * the record it reverts `accepted → reverted` — all in ONE transaction, through
 * `accept_revert_record` (migration 0013).
 *
 * It has to be one transaction for the same reason `accept_change_log_record` does
 * (spec #110 criterion 3), with a third party to keep in step: two round-trips
 * could leave the page set back and the original still reading `accepted`, and
 * since the log only grows, that disagreement would be permanent.
 *
 * THE PLAN IS RECOMPUTED HERE, against the page as it stands now, rather than
 * writing the `after` frozen into the record at propose time. Between raising a
 * revert and answering it the page can gain unrelated edits, and replaying a stale
 * array would silently drop them. Re-planning keeps the design's promise exactly:
 * only the blocks the original touched are set back, everything else stays. If
 * those blocks are the ones that moved, `movedOn` is true and this returns
 * `outdated` without writing — "accept is not offered; revise is offered"
 * (criterion 5) — advancing the revert so the affordance goes with it.
 *
 * Raises — rolling the page write back with it — if the revert is not `proposed`,
 * if it carries no `revert_of`, if the record it reverts is no longer `accepted`,
 * or if the page changed between the plan and the transaction (the RPC's
 * compare-and-swap; the caller re-reads and tries again).
 */
export async function acceptRevert(
  supabase: SupabaseClient<Database>,
  input: AcceptRevertInput
): Promise<AcceptRevertResult> {
  const { revert, original, current } = input
  const actor = input.actor ?? ACTOR_YOU

  const plan = planRevert(original, current)
  if (plan.movedOn) {
    const advanced = await advanceStatus(supabase, revert.id, 'outdated', actor)
    return { kind: 'outdated', revert: advanced }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('accept_revert_record', {
    p_record_id: revert.id,
    p_blocks: plan.blocks,
    p_expected: current,
    p_actor: actor,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error(`change log: accept of revert ${revert.id} returned no record`)
  const accepted = mapChangeLogRow(row as ChangeLogRow)

  // The page has moved on, so every OTHER block diff aimed at it was written
  // against a state that no longer exists — the same G2 sweep an accepted edit
  // runs (criterion 5). Guarded for the same reason it is there: the blocks are
  // already in, and letting a side-record failure escape would report a failed
  // accept for a revert that has landed.
  if (revert.targetPageId !== null) {
    try {
      await markOutdated(supabase, {
        userId: input.userId,
        workspace: input.workspace ?? 'main',
        targetPageId: revert.targetPageId,
        exceptId: revert.id,
        actions: [...BLOCK_ACTIONS],
      })
    } catch (err) {
      console.error('[change-log] outdated sweep failed after revert', revert.id, err)
    }
  }
  return { kind: 'accepted', revert: accepted }
}
