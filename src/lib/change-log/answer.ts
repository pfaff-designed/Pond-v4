/**
 * Answering a proposed-view card with no mounted thread (KAN-96; spec #110).
 *
 * The composer's own accept/reject (`AITerminal.tsx`) work from `useChat`'s live
 * `proposals` reducer state and a `ModuleChange[]` batch — neither of which a
 * card in the proposed view has, since it carries only the settled change-log
 * record. This module answers a RECORD directly, built on the same lower-level
 * primitives the composer's accept paths already call (`addRowFromProposal`,
 * `advanceStatus`), so there is exactly one implementation of how an
 * accept/reject writes.
 *
 * A BLOCK accept does NOT replay `record.after` verbatim. That snapshot is
 * frozen at propose time, and by accept time a sibling card on the same page
 * may have already landed, or the person may have hand-edited a block — either
 * one leaves the live page holding more than the record knows about. So the
 * write re-reads the record and the page fresh under the target page's own
 * lock, derives the diff from `before` → `after` keyed by block id, and applies
 * only the touched ids onto the LIVE blocks. `acceptRecord` (the atomic RPC) is
 * the only write: a refusal — the record settled underneath this click, or a
 * touched block no longer matches its `before` — writes nothing, never a bare
 * `saveBlocks` of the stale snapshot.
 *
 * Pure/Supabase-only — no React, no QueryClient. The caller owns cache
 * invalidation (the proposed query, `['page', targetPageId]`) and session-undo
 * registration (`sessionUndo.remember`, keyed off `AcceptRecordOutcome`'s
 * `undoRecordId`) the way AITerminal's own accept does.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { addRowFromProposal, type AddRowProposal } from '@/lib/pages/create-page'
import { getPage } from '@/lib/pages/client'
import { withPageWriteLock } from '@/lib/pages/accept'
import { reembedPage } from '@/lib/pages/commit'
import { jsonEqual } from '@/lib/json-equal'
import { personFacingMessage, postgresCode } from './errors'
import { refusalForAccept } from './resolve'
import { acceptRevert } from './revert'
import { indexById, readBlockSnapshot, touchedBlockIds } from './revert-plan'
import { canAccept, canReject } from './status'
import { acceptRecord, advanceStatus, getRecord, markOutdated } from './store'
import { ACTOR_YOU, BLOCK_ACTIONS, type ChangeLogAction, type ChangeLogRecord } from './types'

export interface AcceptRecordInput {
  userId: string | null
  pondId: string | null
  record: ChangeLogRecord
}

/** The outcome of an accept click from the proposed view: the advanced record,
 *  or why nothing was written. */
export type AcceptRecordOutcome =
  | { refused: false; record: ChangeLogRecord; undoRecordId: string | null }
  | { refused: true; reason: string }

/** `record.after` as the `add_row` tool call stamped it (`propose.ts`): the
 *  proposal's own arguments, not a diff — see {@link AddRowProposal}. */
function readAddRowProposal(after: unknown): AddRowProposal | null {
  if (typeof after !== 'object' || after === null) return null
  const { collectionId, title, props } = after as Record<string, unknown>
  if (typeof collectionId !== 'string' || collectionId.length === 0) return null
  return {
    collectionId,
    title: typeof title === 'string' ? title : undefined,
    props: typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {},
  }
}

/**
 * Rebuild `current` with the record's touched ids set to their `after` value —
 * the forward twin of `revert-plan.ts`'s `planRevert`, which sets touched ids
 * BACK to `before`. Simpler than that twin: a created block's id in `after` is
 * already the deterministic id `mint-id.ts` would mint on an ordinary accept
 * (not the provisional one `planRevert` has to resolve by value), so a create
 * never needs anything beyond "is this id already on the page".
 */
function applyForwardDiff(before: Block[], after: Block[], current: Block[]): Block[] {
  const beforeById = indexById(before)
  const afterById = indexById(after)
  const touched = new Set(touchedBlockIds(before, after))

  const blocks: Block[] = []
  for (const block of current) {
    if (!touched.has(block.id)) {
      blocks.push(block)
      continue
    }
    const replacement = afterById.get(block.id)
    if (replacement) blocks.push(replacement) // edited in place
    // else: this record deleted it — omit
  }

  // Blocks the record CREATED, anchored after whichever `after`-neighbour is
  // already placed — nothing to anchor to lands at the top. Mirrors
  // `planRevert`'s own anchoring for a restored delete, just forward.
  const placedIds = new Set(blocks.map((b) => b.id))
  after.forEach((block, afterIndex) => {
    if (!touched.has(block.id) || beforeById.has(block.id) || placedIds.has(block.id)) return
    let at = 0
    for (let i = afterIndex - 1; i >= 0; i--) {
      const anchor = blocks.findIndex((b) => b.id === after[i].id)
      if (anchor !== -1) {
        at = anchor + 1
        break
      }
    }
    blocks.splice(at, 0, block)
    placedIds.add(block.id)
  })
  return blocks
}

/** Generic refusal text when the record (re-read fresh) is no longer `proposed`
 *  and {@link refusalForAccept} has no specific line for its status. Exported
 *  so `proposed-view.ts`'s own fallback (the reason line off a transition-less
 *  record) uses this exact string rather than a second copy of it. */
export const ALREADY_DECIDED = 'this proposal has already been decided'

/** The person-facing line for a touched block that moved underneath this
 *  accept — a sibling card on the same page landed first, or someone hand-
 *  edited it, since the card's own copy of the record was last fetched. */
const PAGE_MOVED_ON = 'the page changed since this was proposed'

/**
 * Accept a block edit/revert, re-read and re-derived fresh under the target
 * page's write lock (shared with the composer's own accept — see
 * `src/lib/pages/accept.ts`'s `withPageWriteLock`).
 *
 * The record passed in by the caller is a card's CACHED copy and is not
 * trusted for anything but routing: it may have settled since the card's
 * query last ran. Both the record and the page are re-read inside the lock,
 * the diff is rebuilt against the page's LIVE blocks, and `acceptRecord` (the
 * atomic RPC) is the only write — there is no fallback plain save, which is
 * what let a refused accept overwrite a newer edit with the stale `after`
 * snapshot.
 */
async function acceptBlockEdit(
  supabase: SupabaseClient<Database>,
  opts: { userId: string | null; pondId: string | null; recordId: string; targetPageId: string }
): Promise<AcceptRecordOutcome> {
  const { userId, pondId, recordId, targetPageId } = opts

  const fresh = await getRecord(supabase, recordId)
  if (fresh === null || !canAccept(fresh.status)) {
    return {
      refused: true,
      reason: (fresh && refusalForAccept(fresh.status)) ?? ALREADY_DECIDED,
    }
  }

  const before = readBlockSnapshot(fresh.before) ?? []
  const after = readBlockSnapshot(fresh.after)
  if (after === null) return { refused: true, reason: 'this proposal has no page to write to' }

  const page = await getPage(supabase, targetPageId)
  if (page === null) return { refused: true, reason: 'the page this applied to is gone' }

  // "The page changed since this was proposed" — measured against this
  // record's OWN `before`, the state it was written against. Only a touched
  // id that existed THEN (an edit or a delete) has anything to compare; an id
  // the record created has nothing live to have moved on from.
  const beforeById = indexById(before)
  const currentById = indexById(page.blocks)
  for (const id of touchedBlockIds(before, after)) {
    const was = beforeById.get(id)
    if (was === undefined) continue
    if (!jsonEqual(currentById.get(id) ?? null, was)) {
      return { refused: true, reason: PAGE_MOVED_ON }
    }
  }

  const blocks = applyForwardDiff(before, after, page.blocks)

  let accepted: ChangeLogRecord
  try {
    accepted = await acceptRecord(supabase, recordId, blocks)
  } catch (err) {
    // All-or-nothing: nothing was written — there is no fallback save to fall
    // back to. `22023` is `accept_change_log_record`'s own compare-and-swap
    // refusal (the record is no longer `proposed`), most likely the same race
    // this function's own checks above are trying to close early — that keeps
    // this path's own PAGE_MOVED_ON wording. Anything else (the page gone,
    // a lock timeout, a network error) is unexpected here and goes through
    // the shared mapping instead of being mislabelled as the same race.
    console.error('[change-log] accept refused by the log', recordId, err)
    if (postgresCode(err) === '22023') return { refused: true, reason: PAGE_MOVED_ON }
    return { refused: true, reason: personFacingMessage(err) }
  }

  reembedPage(targetPageId)
  if (userId !== null) {
    // G2: the other proposed block diffs aimed at this page were written
    // against a state that no longer exists now that this one landed.
    try {
      await markOutdated(supabase, {
        userId,
        pondId,
        targetPageId,
        exceptId: recordId,
        actions: [...BLOCK_ACTIONS],
      })
    } catch (err) {
      console.error('[change-log] outdated sweep failed for page', targetPageId, err)
    }
  }

  // Only a step byte-identical to `after` is one 0021's set_back CAS can undo
  // (it sets the page back to `record.before`, which only recovers `after` if
  // what was just written IS `after`) — the same guard `writeAcceptedChanges`
  // applies to its own `recordId`. A page the record's own diff didn't touch
  // in full (an unrelated block changed since propose) writes something else,
  // so ⌘Z is withheld rather than offered a step guaranteed to refuse.
  const undoRecordId = jsonEqual(blocks, after) ? recordId : null
  return { refused: false, record: accepted, undoRecordId }
}

/**
 * Accept a `revert` record through `acceptRevert` (migration 0013,
 * `accept_revert_record`) — exactly the path `PageChangesPanel.onAccept` uses.
 *
 * A revert is NOT a block edit even though it is one of `BLOCK_ACTIONS`:
 * `acceptRecord`/`accept_change_log_record` only advances the record it is
 * handed, while a revert also has to flip the record it reverts
 * `accepted → reverted` in the SAME transaction (criterion 3) — only
 * `accept_revert_record` does both. Routing a revert through `acceptBlockEdit`
 * wrote the page back and marked the revert itself `accepted`, but left the
 * original record `accepted` forever, as if nothing had been taken back.
 */
async function acceptRevertRecord(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; pondId: string | null; record: ChangeLogRecord; targetPageId: string }
): Promise<AcceptRecordOutcome> {
  const { userId, pondId, record, targetPageId } = opts

  const page = await getPage(supabase, targetPageId)
  if (page === null) return { refused: true, reason: 'the page this applied to is gone' }

  const result = await acceptRevert(supabase, {
    userId,
    pondId,
    revert: record,
    current: page.blocks,
  })
  if (result.kind === 'outdated') {
    return { refused: true, reason: PAGE_MOVED_ON }
  }

  reembedPage(targetPageId)
  return { refused: false, record: result.revert, undoRecordId: null }
}

/**
 * Does this action kind have an accept adapter below? `edit`/`revert`
 * (`BLOCK_ACTIONS`) and `add_row` — the five collection-schema tools
 * (`create_page`, `define_schema`, `promote_table`, `configure_view`,
 * `link_records`, `propose.ts`'s `PROPOSAL_ACTIONS`) still reach
 * `proposed`/`outdated` but have no write adapter here (split to KAN-313).
 * The proposed view calls this to decide whether to draw "accept" at all,
 * rather than drawing a button `acceptRecordFromLog` would only refuse.
 */
export function canAcceptAction(action: ChangeLogAction): boolean {
  return BLOCK_ACTIONS.includes(action) || action === 'add_row'
}

/**
 * Accept an `add_row` proposal, re-reading the record fresh immediately
 * before writing — mirrors {@link acceptBlockEdit}'s own re-read-then-write
 * order. Without it, a stale card for a record already settled elsewhere
 * (accepted from the thread, rejected, swept outdated) would add a second row
 * and then throw on `advanceStatus`'s own CAS, leaving the extra row orphaned
 * with no record pointing at it.
 */
async function acceptAddRow(
  supabase: SupabaseClient<Database>,
  opts: { pondId: string | null; recordId: string }
): Promise<AcceptRecordOutcome> {
  const { pondId, recordId } = opts

  const fresh = await getRecord(supabase, recordId)
  if (fresh === null || !canAccept(fresh.status)) {
    return {
      refused: true,
      reason: (fresh && refusalForAccept(fresh.status)) ?? ALREADY_DECIDED,
    }
  }

  const proposal = readAddRowProposal(fresh.after)
  if (proposal === null) {
    return { refused: true, reason: 'this proposal has nothing to add' }
  }

  await addRowFromProposal(supabase, proposal, pondId)
  const advanced = await advanceStatus(supabase, recordId, 'accepted', ACTOR_YOU)
  return { refused: false, record: advanced, undoRecordId: null }
}

/**
 * Accept the WHOLE diff behind one change-log record — scoped, for now, to the
 * two write types the spec's Build bullet names: a block edit/revert
 * (`BLOCK_ACTIONS`) and `add_row`. Anything else is refused with no accept
 * affordance to begin with.
 *
 * Only a live `proposed` record can accept ({@link canAccept}) — an `outdated`
 * record has its accept withdrawn by design, and re-accepting an already
 * settled one would stamp a decision over one already made. This first check
 * is on the CALLER's cached record, purely to route and fail fast on an
 * obviously-stale card; the block path re-checks fresh under its own lock
 * before writing anything (see {@link acceptBlockEdit}).
 */
export async function acceptRecordFromLog(
  supabase: SupabaseClient<Database>,
  opts: AcceptRecordInput
): Promise<AcceptRecordOutcome> {
  const { userId, pondId, record } = opts
  if (!canAccept(record.status)) {
    return {
      refused: true,
      reason: refusalForAccept(record.status) ?? ALREADY_DECIDED,
    }
  }

  if (record.action === 'edit') {
    const targetPageId = record.targetPageId
    if (targetPageId === null) {
      return { refused: true, reason: 'this proposal has no page to write to' }
    }
    return withPageWriteLock(targetPageId, () =>
      acceptBlockEdit(supabase, { userId, pondId, recordId: record.id, targetPageId })
    )
  }

  if (record.action === 'revert') {
    const targetPageId = record.targetPageId
    if (targetPageId === null) {
      return { refused: true, reason: 'this proposal has no page to write to' }
    }
    if (userId === null) {
      return { refused: true, reason: 'not signed in' }
    }
    return acceptRevertRecord(supabase, { userId, pondId, record, targetPageId })
  }

  if (record.action === 'add_row') {
    return acceptAddRow(supabase, { pondId, recordId: record.id })
  }

  return { refused: true, reason: 'this proposal type cannot be accepted from here yet' }
}

/**
 * Reject the whole diff behind one record — a live `proposed` one, or an
 * `outdated` one whose accept is withdrawn but still needs a way to leave the
 * proposed view ({@link canReject}, `status.ts`'s one new edge for KAN-96). A
 * no-op on anything already settled past that.
 */
export async function rejectRecordFromLog(
  supabase: SupabaseClient<Database>,
  record: ChangeLogRecord
): Promise<ChangeLogRecord> {
  if (!canReject(record.status)) return record
  return advanceStatus(supabase, record.id, 'rejected', ACTOR_YOU)
}

/** The canned note `revise` sends on an outdated card (#98, G2): Pond redrafts
 *  the diff against the page as it now stands. Lives here (not `AITerminal.tsx`)
 *  so a record's own revise affordance and the composer's share one copy without
 *  either importing the other's React tree — `AITerminal.tsx` imports it from
 *  here rather than defining its own. */
export const REVISE_NOTE =
  'the page changed since this was proposed — revise it against the page as it now stands.'
