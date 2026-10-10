/**
 * Undo and redo as change-log records (KAN-93) — the calls into the database.
 *
 * "The undo is a record of its own, and the record it undid is marked undone."
 * "redo ⇧⌘Z is a record too." Both happen inside one RPC each (migration 0021),
 * which compares the page against the state the record left before writing and
 * lands a whole step or nothing. This module calls them and turns their refusals
 * into outcomes a surface can say out loud: a page that changed since is `stale`,
 * a record that cannot be taken back is `refused`. Only a failure it cannot
 * classify — the network, most likely — is thrown, because that step may still
 * succeed if tried again.
 *
 * The session stack that decides WHICH step is next lives in `session-undo.ts`.
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js and no React.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { mapChangeLogRow, markOutdated } from './store'
import {
  ACTOR_YOU,
  BLOCK_ACTIONS,
  type ChangeLogActor,
  type ChangeLogRecord,
  type ChangeLogRow,
} from './types'

/** One undo step: the record(s) one action made, in the pond it made them in. */
export interface UndoStep {
  pondId: string
  recordIds: readonly string[]
}

/** What became of an undo or redo. */
export type StepResult =
  /** It landed. One new record per record in the step, in the order applied. */
  | { kind: 'done'; records: ChangeLogRecord[] }
  /** The page changed since, so nothing was written; revert from the log instead. */
  | { kind: 'stale'; message: string }
  /** The step cannot be taken back here (already undone, gone, another pond, …). */
  | { kind: 'refused'; message: string }

const STALE_CODE = '40001'

/** The SQLSTATEs 0021's functions raise on purpose, plus a redo re-adding a
 *  record whose name a sibling has taken since. */
const REFUSAL_CODES: ReadonlySet<string> = new Set(['22023', 'P0002', '0A000', '23505'])

interface RpcError {
  code?: string
  message?: string
}

const classify = (error: RpcError): StepResult | null => {
  const message = error.message ?? ''
  if (error.code === STALE_CODE) return { kind: 'stale', message }
  if (error.code !== undefined && REFUSAL_CODES.has(error.code)) return { kind: 'refused', message }
  return null
}

/**
 * A page whose blocks a step just moved has pending block diffs written against
 * the state it left. `accept_change_log_record` writes without comparing, so they
 * must go `outdated` — the same sweep an accepted edit or revert runs. Once per
 * page, against the blocks it ended on; never throws, because the step has landed.
 */
const sweepMovedPages = async (
  supabase: SupabaseClient<Database>,
  pondId: string,
  records: readonly ChangeLogRecord[]
): Promise<void> => {
  const endedOn = new Map<string, { userId: string; blocks: unknown }>()
  for (const record of records) {
    if (record.targetPageId === null || !Array.isArray(record.after)) continue
    endedOn.set(record.targetPageId, { userId: record.userId, blocks: record.after })
  }
  for (const [targetPageId, { userId, blocks }] of endedOn) {
    try {
      await markOutdated(supabase, {
        userId,
        pondId,
        targetPageId,
        actions: [...BLOCK_ACTIONS],
        pageBlocks: blocks,
        actor: ACTOR_YOU,
      })
    } catch (err) {
      console.error('[change-log] outdated sweep failed after undo/redo', targetPageId, err)
    }
  }
}

const runStep = async (
  supabase: SupabaseClient<Database>,
  fn: 'undo_change_log_record' | 'redo_change_log_record',
  step: UndoStep,
  actor: ChangeLogActor
): Promise<StepResult> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, {
    p_record_ids: [...step.recordIds],
    p_pond_id: step.pondId,
    p_actor: actor,
  })
  if (error) {
    const outcome = classify(error as RpcError)
    if (outcome === null) throw error
    return outcome
  }
  const records = ((data ?? []) as ChangeLogRow[]).map(mapChangeLogRow)
  await sweepMovedPages(supabase, step.pondId, records)
  return { kind: 'done', records }
}

/** Take a step back: each record in it goes `undone`, each gains an `undo` record. */
export const undoStep = (
  supabase: SupabaseClient<Database>,
  step: UndoStep,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<StepResult> => runStep(supabase, 'undo_change_log_record', step, actor)

/**
 * Put an undone step back: each record in it gains a `redo` record, and the undo
 * that took it back goes `undone`. `step` names the ORIGINAL records, the same
 * ids that were undone.
 */
export const redoStep = (
  supabase: SupabaseClient<Database>,
  step: UndoStep,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<StepResult> => runStep(supabase, 'redo_change_log_record', step, actor)
