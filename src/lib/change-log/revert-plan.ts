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
import { jsonEqual } from '@/lib/json-equal'
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

/** A block's content as a stable string, ignoring `id` and JSONB key order. */
function valueKey(block: Block): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (typeof value !== 'object' || value === null) return value
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
    return entries.map(([k, v]) => [k, canonical(v)])
  }
  return JSON.stringify(canonical(withoutId(block)))
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
  // its id there is PROVISIONAL (see `sameBlockIgnoringId`). Resolving it to what
  // it actually became on the page is the delicate part, because getting it wrong
  // deletes something the person wrote:
  //
  //   * the id IS on the page and still matches  → that is the block;
  //   * the id IS on the page but has changed    → it moved on. NOT a licence to
  //     go looking for some other block that happens to look like it;
  //   * the id is absent (re-minted on accept)   → find it by value, but only when
  //     the match is UNAMBIGUOUS: the number of unclaimed look-alikes on the page
  //     must equal the number of creates with that same content. Fewer means one
  //     is gone; more means we cannot tell which is which, and a revert must never
  //     guess at which block to delete.
  //
  // Probed live: Pond appends an empty text block, the person types into it, and
  // the page also holds an unrelated empty paragraph. Before this rule, the revert
  // bound the create to the unrelated paragraph, deleted both it AND the person's
  // typing, and reported `movedOn: false` — a clean-looking accept that destroyed
  // two blocks.
  const createdNow = new Map<string, string | null>()
  const claimed = new Set<string>()
  const byValue: Map<string, string[]> = new Map()
  for (const id of touchedIds) {
    if (beforeById.has(id)) continue
    const created = afterById.get(id)
    if (created === undefined) continue
    const onPage = currentById.get(id)
    if (onPage !== undefined) {
      const kept = !claimed.has(onPage.id) && sameBlockIgnoringId(onPage, created)
      createdNow.set(id, kept ? onPage.id : null)
      // Claimed EITHER WAY. This block is spoken for: it is this create, changed
      // or not. Leaving it unclaimed let a sibling create bind to some other
      // look-alike and mark it for deletion — probed as `after [provX, provY]`
      // against page `[provX(edited), real]`, which planned to delete `real`.
      claimed.add(onPage.id)
      continue
    }
    const key = valueKey(created)
    const group = byValue.get(key)
    if (group) group.push(id)
    else byValue.set(key, [id])
  }
  for (const [key, ids] of byValue) {
    // `!beforeById.has(b.id)` — a block that was already on the page BEFORE the
    // original ran cannot be what it created. Counting those in dead-ended the
    // revert permanently: two blank paragraphs, two `---` dividers or two
    // identical list items made the counts disagree, so the revert was born
    // `outdated` even though nothing had moved, and clicking Revert again only
    // appended another one to a log that never forgets.
    const candidates = current.filter(
      (b) => !claimed.has(b.id) && !beforeById.has(b.id) && valueKey(b) === key
    )
    if (candidates.length !== ids.length) {
      for (const id of ids) createdNow.set(id, null)
      continue
    }
    ids.forEach((id, i) => {
      createdNow.set(id, candidates[i].id)
      claimed.add(candidates[i].id)
    })
  }
  /**
   * Page-side ids of the blocks the original added — the ones a revert removes.
   *
   * ALL OR NOTHING. If any create could not be resolved, this plan is already
   * `outdated` and will never be written; removing the creates that DID resolve
   * would still hand the caller an array that deletes blocks, and a pure function
   * should not return a destructive plan it has itself judged unsound.
   */
  const unresolved = [...createdNow.values()].some((id) => id === null)
  const removeIds = unresolved
    ? new Set<string>()
    : new Set<string>([...createdNow.values()].filter((id): id is string => id !== null))

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
    // Added by the original ⇒ the revert removes it, under the id it landed as.
    if (removeIds.has(block.id)) continue
    // Changed by the original ⇒ set that block back. Keyed on `beforeById`, never
    // on `touched` alone: a touched id may be a PROVISIONAL one, and a page block
    // that merely shares it is somebody else's and must not be dropped.
    const restored = touched.has(block.id) ? beforeById.get(block.id) : undefined
    blocks.push(restored ?? block)
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
