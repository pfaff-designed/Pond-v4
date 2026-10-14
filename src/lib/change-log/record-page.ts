/**
 * The change log record page's view model (KAN-152; board
 * `Pond 06.15 Change log`, frames `s6o3`/`s6o4`).
 */

import type { Block } from '@/lib/documents/types'
import { resolveDescriptor } from '@/lib/modules/registry'
import { CHANGE_LOG_NODE_ID } from './log-page'
import { describeChange } from './page-changes'
import { readBlockSnapshot } from './revert-plan'
import type { ChangeLogRecord } from './types'

/** The search param naming which record the change log page's route opens. */
export const RECORD_PARAM = 'record'

/** The workspace URL for one record's page — one more param on the existing
 *  `?nodeId=__change_log__` change log route, not a new router concept. */
export function changeLogRecordUrl(recordId: string): string {
  const params = new URLSearchParams({ nodeId: CHANGE_LOG_NODE_ID, [RECORD_PARAM]: recordId })
  return `?${params.toString()}`
}

/**
 * The record page's title: the changed block's own preview text
 * ("electrician, second fix → w/c 6 oct"), through the block registry's
 * `preview` facet. Falls back to `describeChange`'s plain label for every
 * non-block action, and for a block action whose snapshot doesn't carry
 * `targetBlockId` (nothing live to preview).
 *
 * The block itself is read from the record's OWN `after` (falling back to
 * `before`) — the title names what this record changed, not the page as it
 * reads today. `blocks` are the target page's current page-mates (ticket-23
 * siblings), passed by a caller that has them in hand; omit when it doesn't.
 */
export function recordTitle(record: ChangeLogRecord, blocks?: readonly Block[]): string {
  const snapshot = readBlockSnapshot(record.after) ?? readBlockSnapshot(record.before)
  const block = snapshot?.find((b) => b.id === record.targetBlockId)
  if (block === undefined) return describeChange(record, null)
  return resolveDescriptor(block.type).preview(block, blocks)
}
