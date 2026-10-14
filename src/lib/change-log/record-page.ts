/**
 * The change log record page's view model (KAN-152; board
 * `Pond 06.15 Change log`, frames `s6o3`/`s6o4`).
 */

import type { UIMessage } from 'ai'
import type { Block } from '@/lib/documents/types'
import type { ChangePreview } from '@/lib/modules/preview'
import { blockLabel } from '@/lib/modules/types'
import { descriptorFor, resolveDescriptor } from '@/lib/modules/registry'
import { CHANGE_LOG_NODE_ID, pageLabel } from './log-page'
import { clockTime, describeChange, formatClockTime } from './page-changes'
import { buildDiffRows } from './proposed-view'
import { readBlockSnapshot } from './revert-plan'
import { labelForStatus } from './status'
import { BLOCK_ACTIONS, type ChangeLogRecord } from './types'

/** The search param naming which record the change log page's route opens. */
export const RECORD_PARAM = 'record'

/** The workspace URL for one record's page — one more param on the existing
 *  `?nodeId=__change_log__` change log route, not a new router concept. */
export function changeLogRecordUrl(recordId: string): string {
  const params = new URLSearchParams({ nodeId: CHANGE_LOG_NODE_ID, [RECORD_PARAM]: recordId })
  return `?${params.toString()}`
}

/**
 * Which block a record actually changed, read from its OWN before/after
 * snapshots — `null` when neither side is a block array (a collection-tool
 * record) or nothing differs.
 *
 * `targetBlockId` is tried FIRST but is not load-bearing: `propose.ts` never
 * sets it for a `propose_changes` call (the only tool that snapshots real
 * blocks), so every composer-made edit's `targetBlockId` is `null` in
 * storage. When it doesn't resolve, this zips `before`/`after` by id with
 * `buildDiffRows` — the SAME diffing `recordDiffRows`'s own before→after card
 * already uses — and takes its first row: a composer turn changes one block
 * in practice, and "first" matches that row's own `after`-then-removed-from-
 * `before` order.
 */
function resolvedBlockChange(record: ChangeLogRecord): ChangePreview | null {
  const beforeBlocks = readBlockSnapshot(record.before)
  const afterBlocks = readBlockSnapshot(record.after)
  if (beforeBlocks === null && afterBlocks === null) return null
  if (record.targetBlockId !== null) {
    const before = beforeBlocks?.find((b) => b.id === record.targetBlockId) ?? null
    const after = afterBlocks?.find((b) => b.id === record.targetBlockId) ?? null
    if (before !== null || after !== null) {
      return { op: before && after ? 'edit' : after ? 'create' : 'remove', before, after }
    }
  }
  return buildDiffRows(beforeBlocks ?? [], afterBlocks ?? [])[0] ?? null
}

/** `~60`-char one-liner, since a text block carries no registry `preview`
 *  facet (it falls back to its whole, unbounded `serialize`d markdown) —
 *  the only block kind that needs trimming here, since every other
 *  registered type's own `preview` already returns a short line. */
const TITLE_PREVIEW_MAX_CHARS = 60

function oneLineOf(text: string, max = TITLE_PREVIEW_MAX_CHARS): string {
  const line =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ''
  return line.length <= max ? line : `${line.slice(0, max).trimEnd()}…`
}

/** A changed block's own title text — the registry's `preview` facet, or
 *  (text has none) its plain content, trimmed to one line. */
function blockPreviewText(block: Block, blocks?: readonly Block[]): string {
  if (block.type === 'text') return oneLineOf('content' in block ? String(block.content) : '')
  return resolveDescriptor(block.type).preview(block, blocks)
}

/**
 * The record page's title: the changed block's own preview text
 * ("electrician, second fix → w/c 6 oct"), through the block registry's
 * `preview` facet. An edit (both a before AND an after block) reads as
 * "{before preview} → {after preview}"; an insert or removal (only one side)
 * reads as that side's preview alone. Falls back to `describeChange`'s plain
 * label for every non-block action, and for a block action with no live
 * snapshot to diff.
 *
 * `blocks` are the target page's current page-mates (ticket-23 siblings),
 * passed by a caller that has them in hand; omit when it doesn't.
 */
export function recordTitle(record: ChangeLogRecord, blocks?: readonly Block[]): string {
  const change = resolvedBlockChange(record)
  if (change === null) return describeChange(record, null)
  const { before, after } = change
  if (before !== null && after !== null) {
    return `${blockPreviewText(before, blocks)} → ${blockPreviewText(after, blocks)}`
  }
  return blockPreviewText((after ?? before) as Block, blocks)
}

/**
 * The breadcrumb's last crumb (s6o3/s6o4's `PondCommand` path: `life ›
 * databases › change log › electrician, second fix`): `recordTitle`'s own
 * string, with any " → " and everything after it dropped. `recordTitle`'s
 * "x → y" shape (a table row's name → its changed cells, "mark → automatic",
 * "colour → sage", …) always puts the NAME of what changed before the arrow
 * and the new value after it — the breadcrumb names the record, the page's
 * own title (s6o3's 38px line) is the only place that also says what it
 * became. A title with no arrow (an ordinary block's content, "apple") is
 * unchanged.
 */
export function recordBreadcrumbTitle(record: ChangeLogRecord, blocks?: readonly Block[]): string {
  const title = recordTitle(record, blocks)
  const arrow = title.indexOf(' → ')
  return arrow === -1 ? title : title.slice(0, arrow)
}

/**
 * The fields grid's "status" row: `labelForStatus`'s word, the actor of the
 * transition that landed the CURRENT status, and that transition's clock time
 * — "accepted by you · 09:31". `transitions` is append-only, so its last entry
 * is always the one that produced `record.status`/`statusAt`; a record with no
 * transitions yet (a fixture, or a status predating this column) falls back to
 * the record's own `actor`. One status-labelling and one clock-formatting
 * path, reused rather than duplicated.
 */
export function statusField(record: ChangeLogRecord): string {
  const actor = record.transitions.at(-1)?.actor ?? record.actor
  return `${labelForStatus(record.status)} by ${actor} · ${formatClockTime(record.statusAt)}`
}

/** The fields grid's "proposed by" row: who proposed the record and when —
 *  "pond · 09:20". */
export function proposedByField(record: ChangeLogRecord): string {
  return `${record.actor} · ${clockTime(record)}`
}

/** The fields grid's "page" row: the target page's title, plus the changed
 *  block's own label when one resolves. The block is read off the record's
 *  OWN snapshot first (what it actually changed), falling back to the page's
 *  CURRENT page-mates (`blocks`, ticket-23 siblings) — a collection-tool
 *  record's snapshot is a {@link import('./types').RowSnapshot}, not a block
 *  array, so its containing block (the database) is only findable live. */
export interface PageBlockField {
  page: string
  block: string | null
}

/** The fields grid's "read" row: the chip strings Pond read before proposing
 *  (KAN-47's provenance chips). `record.read` is `unknown` at the storage
 *  boundary — a tolerant parse, not a schema: an array of strings passes
 *  through as-is, anything else (null, a stray object, a malformed row) is
 *  read as "nothing to show" rather than thrown. */
export function readChipsOf(record: ChangeLogRecord): string[] {
  const { read } = record
  if (Array.isArray(read) && read.every((entry) => typeof entry === 'string')) {
    return read as string[]
  }
  return []
}

/** The fields grid's "reverted by" row: the newest revert of this record,
 *  when one exists — frame s6o4. `reverts` is `listRevertsOf`'s result
 *  (newest first); only the first (newest) one is shown. */
export interface RevertedByField {
  recordId: string
  /** "revert · 10:02" — the word, not just the clock time, since this is the
   *  ONLY place a revert names itself that way (every other clock label on
   *  the page is bare HH:MM). */
  clockLabel: string
  /** The linked pill's text — the revert record's own current status. */
  statusPillText: string
}

export function revertedByField(reverts: ChangeLogRecord[]): RevertedByField | null {
  const newest = reverts[0]
  if (newest === undefined) return null
  return {
    recordId: newest.id,
    clockLabel: `revert · ${clockTime(newest)}`,
    statusPillText: labelForStatus(newest.status),
  }
}

export function pageBlockField(
  record: ChangeLogRecord,
  pageTitleById: Map<string, string>,
  blocks: readonly Block[] = []
): PageBlockField {
  const page = pageLabel(record, pageTitleById)
  const change = resolvedBlockChange(record)
  const block =
    change?.after ?? change?.before ?? blocks.find((b) => b.id === record.targetBlockId) ?? null
  if (block === null) return { page, block: null }
  return { page, block: blockLabel(block) ?? descriptorFor(block.type)?.label ?? block.type }
}

/** The "before → after" card's rows — only for a {@link BLOCK_ACTIONS} record
 *  (`edit`/`revert`), whose snapshots are block arrays. `null` for every
 *  other action (a collection tool's snapshot is a `RowSnapshot`, not a block
 *  array), AND for a block action with no `after` snapshot (an outdated
 *  revert's own plan is never persisted — see `revert.ts`'s own comment on
 *  `after: plan.movedOn ? null : plan.blocks`) — diffing a real `before`
 *  against an absent `after` would render every one of the page's blocks as a
 *  fabricated removal, which nothing proposed. The component falls back to
 *  one plain-text line in both `null` cases. Reuses `buildDiffRows` verbatim
 *  — the same zip-by-id the `proposed` view's cards already use, never a
 *  second diffing path. */
export function recordDiffRows(record: ChangeLogRecord): ChangePreview[] | null {
  if (!BLOCK_ACTIONS.includes(record.action)) return null
  const after = readBlockSnapshot(record.after)
  if (after === null) return null
  return buildDiffRows(readBlockSnapshot(record.before) ?? [], after)
}

/** One row of the "this change" column — frame s6o3. */
export interface ChangeTimelineRow {
  /** "09:12" — the transition's own clock time, not the record's `createdAt`. */
  time: string
  /** "proposed" / "changes requested" / "revised" / "accepted" / … */
  event: string
  /** A short mono line under the event — a record's own short label for
   *  `proposed`/`revised`, the actor for everything else. */
  detail: string
  /** Is this transition's own record the one the page is viewing? */
  highlighted: boolean
}

/**
 * The "this change" column: `chain`'s records PLUS every `reverts` record,
 * each flattened into one row per `transitions` entry, in TIME order (the
 * spec's "linked records in order from listRevisionsOf / listRevertsOf /
 * links" — a chain record's own transition and a revert raised against some
 * other chain record can interleave, so appending reverts after the chain
 * and relying on the chain's own order is not enough).
 *
 * A record's own first `proposed` transition reads as "revised" when
 * `links.revisedFrom` names the record it revises, or "reverted" when
 * `links.revertOf` names the record it reverts — the same transition, just
 * the word that revision/revert earns over a fresh proposal. Every later
 * transition on a revert record (`accepted`/`outdated`/`rejected`, …) reads
 * as its own ordinary status word, same as any other record.
 *
 * `detail` reuses `describeChange` (the record's own short label) for
 * `proposed`/`revised`/`reverted` rather than a second description path;
 * every other event has no stored note text to show (`changes_requested`
 * included — the note travels live to the composer, never onto the record),
 * so its detail is the transition's own actor.
 *
 * A chain record's OWN transition into `reverted` status (`revert.ts`'s
 * `accepted → reverted`, written in the same transaction as the revert's own
 * `accepted`) is dropped rather than flattened into its own row — it would
 * otherwise duplicate the "reverted" word the linked revert record's own
 * first-proposed transition already earns, one instant apart for nothing.
 */
/** The fields grid's "from thread" chip: the thread's first question, joined
 *  from its text parts — the same text-joining `AITerminal.tsx`'s own
 *  `questionBefore` uses, but finding the FIRST user message rather than the
 *  nearest one before some index. `null` with no user message at all. */
export function firstQuestionFromMessages(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === 'user')
  if (first === undefined) return null
  return first.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')
}

export function buildChangeTimeline(
  chain: ChangeLogRecord[],
  viewingId: string,
  reverts: ChangeLogRecord[] = []
): ChangeTimelineRow[] {
  const rows = [...chain, ...reverts].flatMap((record) =>
    record.transitions
      .filter((transition) => transition.status !== 'reverted')
      .map((transition, index) => {
        const isRevision =
          index === 0 && transition.status === 'proposed' && record.links.revisedFrom !== undefined
        const isRevert =
          index === 0 && transition.status === 'proposed' && record.links.revertOf !== undefined
        const event = isRevision
          ? 'revised'
          : isRevert
            ? 'reverted'
            : labelForStatus(transition.status)
        return {
          at: transition.at,
          row: {
            time: formatClockTime(transition.at),
            event,
            detail:
              transition.status === 'proposed' ? describeChange(record, null) : transition.actor,
            highlighted: record.id === viewingId,
          },
        }
      })
  )
  return rows.sort((a, b) => a.at.localeCompare(b.at)).map(({ row }) => row)
}
