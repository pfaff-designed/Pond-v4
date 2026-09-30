/**
 * Planning a revert (issue #103, spec #110 — direction LOCKED = Option A).
 *
 * Design law, storyboard `Pond 06.15 Change log.dc.html` frame 4: "Revert doesn't
 * rewrite history. It adds a new proposed diff that sets the block back, and links
 * the two records." — "revert goes through accept like any change", and "any
 * accepted record can be reverted. If the block has moved on, the revert arrives
 * outdated and Pond offers a revision."
 *
 * HONEST LIMIT ON THAT LAST CLAUSE. The arriving-outdated half is built; the
 * "offers a revision" half is NOT. There is no revise verb on any surface yet —
 * `reviseRecord` exists in `store.ts` with no caller — so an outdated revert is
 * answered by reverting the original again, which re-plans against the page as it
 * then stands. #110's Delivered-by table routes criterion 5 to #102 "+ downstream
 * diff-flow work", not here; the panel says what to do instead of implying a
 * button that is not there.
 *
 * WHEN THE ORIGINAL BECOMES `reverted`. Not at propose time. Frame 4's record page
 * is a field grid whose two rows are `status → accepted by you · 09:31` and
 * `reverted by → revert · 10:02 [proposed]`. `reverted by` is a FIELD LABEL, not a
 * transition: the original still reads `accepted` while its revert is merely
 * proposed, and the pill is the REVERT record's status. So the original advances
 * `accepted → reverted` only when the revert is accepted — which is also the only
 * coherent reading, since `reverted` is terminal in `status.ts` and a rejected
 * revert must leave the original standing. That advance rides inside
 * `accept_revert_record` (0013); see `revert.ts` for the write side.
 *
 * WHAT CAN BE REVERTED, AND WHY ONLY THAT. The `BLOCK_ACTIONS` — `edit`, and
 * `revert` itself, since a revert that landed is an accepted record like any
 * other and carries the same kind of snapshot. Those are the only records with a
 * real before/after: `propose.ts` snapshots the target page's full `Block[]` for
 * `propose_changes` and stores the CALL (`before: null`) for the other tools,
 * whose before/after live in a page's property schema and rows rather than its
 * blocks (#146 item 4, still open). A revert needs a `before` to set back to, so
 * those get no affordance at all rather than one that cannot work.
 *
 * Everything here is PURE — no Supabase, no React. The writes live in `revert.ts`.
 */

import type { Block } from '@/lib/documents/types'
import { BLOCK_ACTIONS, type ChangeLogRecord, type ChangeLogStatus } from './types'

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

/**
 * Structural equality between two blocks, ignoring `id`.
 *
 * Needed because a CREATED block's id in a record's `after` is PROVISIONAL —
 * `propose.ts` says so outright: "the client mints its own on accept, so a
 * created block's id in `after` need not be the id that finally lands." Matching
 * a create by id alone therefore never finds it on the page, and since `after` is
 * frozen by 0011's append-only trigger (content may be redacted, never rewritten)
 * the record can never be corrected after the fact. So the block is found by what
 * it IS instead. Seen live: an accepted record whose `after` names block
 * `e00ac26c…` on a page holding the identical block as `36a32c65…`.
 */
function sameBlockIgnoringId(a: Block, b: Block): boolean {
  return jsonEqual(withoutId(a), withoutId(b))
}

function withoutId(block: Block): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(block as unknown as Record<string, unknown>) }
  delete out.id
  return out
}

function indexById(blocks: Block[]): Map<string, Block> {
  const map = new Map<string, Block>()
  for (const block of blocks) map.set(block.id, block)
  return map
}

// ── Can this record be reverted? ─────────────────────────────────────────────

/** Why a record offers no revert. `null` from {@link revertRefusal} means it does. */
export type RevertRefusal =
  'not-accepted' | 'not-a-block-diff' | 'no-snapshot' | 'no-target-page' | 'nothing-to-revert'

/** One short human line per refusal, for the panel. */
export const REVERT_REFUSALS: Readonly<Record<RevertRefusal, string>> = {
  'not-accepted': 'only an accepted change can be reverted',
  'not-a-block-diff': 'this kind of change cannot be set back yet',
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
  // Any action whose before/after IS a block array, which since #103 is a revert
  // as well as an edit — "any accepted record can be reverted", and a revert that
  // landed is an accepted record like any other. The five collection tools stay
  // out: `propose.ts` stores the CALL for them with `before: null` (#146 item 4),
  // so there is nothing to set back and no affordance is offered.
  if (!BLOCK_ACTIONS.includes(record.action)) return 'not-a-block-diff'
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
  /**
   * The revert's own diff: just the blocks it touches, as they stand now and as
   * they would read after.
   *
   * These, NOT {@link blocks}, are what the record stores. A whole-page array
   * frozen at propose time would describe a page that never existed by the time
   * the revert is accepted — accept RE-PLANS against the page as it then stands
   * (so unrelated edits made in between survive), and `after` is frozen by 0011's
   * append-only trigger, so the record could never be corrected. Spec #110 §1
   * allows "Block/page/record shape", and the storyboard's revert card is two
   * diff-lines — one removal, one addition — not a page snapshot. Block-scoped is
   * both the honest record and the one the design draws.
   */
  diffBefore: Block[]
  diffAfter: Block[]
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

  // A touched id that appears ONLY in `after` is a block the original CREATED, and
  // its id there is provisional (see `sameBlockIgnoringId`). Find what it actually
  // became on the page: the same id when that is what landed, otherwise an
  // unclaimed block that is identical apart from its id. Claiming keeps two
  // identical creates in one batch matched one-to-one rather than both to the
  // first candidate. No match means the created block is gone or has been edited
  // since — which is exactly "the block has moved on".
  const createdNow = new Map<string, string | null>()
  const claimed = new Set<string>()
  for (const id of touchedIds) {
    if (beforeById.has(id)) continue
    const created = afterById.get(id)
    if (created === undefined) continue
    const byId = currentById.get(id)
    if (byId !== undefined && !claimed.has(byId.id) && sameBlockIgnoringId(byId, created)) {
      createdNow.set(id, byId.id)
      claimed.add(byId.id)
      continue
    }
    const match = current.find((b) => !claimed.has(b.id) && sameBlockIgnoringId(b, created))
    if (match !== undefined) {
      createdNow.set(id, match.id)
      claimed.add(match.id)
    } else {
      createdNow.set(id, null)
    }
  }
  /** Page-side ids of the blocks the original added — the ones a revert removes. */
  const removeIds = new Set<string>(
    [...createdNow.values()].filter((id): id is string => id !== null)
  )

  // "If the block has moved on…" — measured against the original's OWN `after`,
  // which is the state it left the page in. Anything else editing those blocks
  // since (another accepted diff, or the person typing) makes this revert a diff
  // written against a page that no longer exists.
  const movedOn = touchedIds.some((id) => {
    // A create is resolved by value, so "still there" is what the map says.
    if (!beforeById.has(id)) return createdNow.get(id) === null
    return !jsonEqual(currentById.get(id) ?? null, afterById.get(id) ?? null)
  })

  // Walk the CURRENT page, so untouched blocks keep their place and their content.
  const blocks: Block[] = []
  for (const block of current) {
    // Added by the original ⇒ the revert removes it, under whatever id it landed as.
    if (removeIds.has(block.id)) continue
    if (!touched.has(block.id)) {
      blocks.push(block)
      continue
    }
    const restored = beforeById.get(block.id)
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

  // The record's own diff, in `before`-order then any created blocks, so two runs
  // over the same inputs produce the same record.
  const diffBefore: Block[] = []
  const diffAfter: Block[] = []
  for (const id of touchedIds) {
    const restored = beforeById.get(id)
    if (restored === undefined) {
      // The original CREATED this block, so the revert removes it: it appears in
      // the diff's before (under the id it actually landed as) and not in its after.
      const landedId = createdNow.get(id)
      const landed =
        landedId === null || landedId === undefined ? undefined : currentById.get(landedId)
      if (landed !== undefined) diffBefore.push(landed)
      continue
    }
    // An update, or a delete the revert brings back. Absent from the page today
    // means there is no "before" line to draw — only the restoration.
    const onPage = currentById.get(id)
    if (onPage !== undefined) diffBefore.push(onPage)
    diffAfter.push(restored)
  }

  return {
    blocks,
    diffBefore,
    diffAfter,
    touchedIds,
    movedOn,
    status: movedOn ? 'outdated' : 'proposed',
  }
}
