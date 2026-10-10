/**
 * Undo and redo as change-log records (KAN-93) — the calls into the database.
 *
 * Each step is one RPC (migration 0021): it compares what the records changed
 * against how they left it, writes, logs the undo/redo records, advances the
 * originals and outdates the pending diffs it made stale — all or nothing. A
 * refusal comes back as a reason code read off the SQL DETAIL, never as raw text:
 * the code is what a surface turns into copy. Only a failure with no code — the
 * network, most likely — is thrown, because that step may still succeed.
 *
 * Which step is next lives in `session-undo.ts`.
 *
 * Framework-agnostic — takes a SupabaseClient, no Next.js and no React.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { mapChangeLogRow } from './store'
import { ACTOR_YOU, type ChangeLogActor, type ChangeLogRecord, type ChangeLogRow } from './types'

/** One step of history: the record(s) one action made, in the pond it made them in. */
export interface HistoryStep {
  pondId: string
  recordIds: readonly string[]
}

/** The thing moved since, so nothing was written. Revert from the log instead. */
export const STALE_REASONS = ['page-changed', 'record-changed', 'linked-elsewhere'] as const
/** The step cannot be taken back (or put back) at all. */
export const REFUSED_REASONS = [
  'already-undone',
  'not-undone',
  'not-undoable',
  'other-pond',
  'name-taken',
  'not-found',
  'page-gone',
] as const

export type StaleReason = (typeof STALE_REASONS)[number]
export type RefusedReason = (typeof REFUSED_REASONS)[number]

export type StepResult =
  /** It landed. One new record per record in the step, in the order applied. */
  | { outcome: 'done'; records: ChangeLogRecord[] }
  | { outcome: 'stale'; reason: StaleReason }
  | { outcome: 'refused'; reason: RefusedReason }

const STALE_CODE = '40001'

/** What PostgREST returns for a raised exception: DETAIL arrives as `details`. */
interface RpcError {
  code?: string
  details?: string | null
  message?: string
}

type StepRpc = 'undo_change_log_record' | 'redo_change_log_record'

interface StepRpcArgs {
  p_record_ids: string[]
  p_pond_id: string
  p_actor: ChangeLogActor
}

/** The two 0021 functions, which the generated `Database` types do not declare. */
interface StepRpcClient {
  rpc: (
    fn: StepRpc,
    args: StepRpcArgs
  ) => PromiseLike<{ data: ChangeLogRow[] | null; error: RpcError | null }>
}

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value)

const classify = (error: RpcError): StepResult | null => {
  const reason = error.details ?? ''
  if (error.code === STALE_CODE) {
    return isOneOf(STALE_REASONS, reason) ? { outcome: 'stale', reason } : null
  }
  return isOneOf(REFUSED_REASONS, reason) ? { outcome: 'refused', reason } : null
}

const runStep = async (
  supabase: SupabaseClient<Database>,
  fn: StepRpc,
  step: HistoryStep,
  actor: ChangeLogActor
): Promise<StepResult> => {
  const client = supabase as unknown as StepRpcClient
  const { data, error } = await client.rpc(fn, {
    p_record_ids: [...step.recordIds],
    p_pond_id: step.pondId,
    p_actor: actor,
  })
  if (error) {
    const result = classify(error)
    if (result === null) throw error
    return result
  }
  return { outcome: 'done', records: (data ?? []).map(mapChangeLogRow) }
}

/** Take a step back: each record in it goes `undone`, each gains an `undo` record. */
export const undoStep = (
  supabase: SupabaseClient<Database>,
  step: HistoryStep,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<StepResult> => runStep(supabase, 'undo_change_log_record', step, actor)

/**
 * Put an undone step back: each record in it gains a `redo` record, and the undo
 * that took it back goes `undone`. `step` names the ORIGINAL records, the same
 * ids that were undone.
 */
export const redoStep = (
  supabase: SupabaseClient<Database>,
  step: HistoryStep,
  actor: ChangeLogActor = ACTOR_YOU
): Promise<StepResult> => runStep(supabase, 'redo_change_log_record', step, actor)
