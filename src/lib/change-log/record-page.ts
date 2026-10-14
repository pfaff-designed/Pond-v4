/**
 * The change log record page's view model (KAN-152; board
 * `Pond 06.15 Change log`, frames `s6o3`/`s6o4`).
 */

import { CHANGE_LOG_NODE_ID } from './log-page'

/** The search param naming which record the change log page's route opens. */
export const RECORD_PARAM = 'record'

/** The workspace URL for one record's page — one more param on the existing
 *  `?nodeId=__change_log__` change log route, not a new router concept. */
export function changeLogRecordUrl(recordId: string): string {
  const params = new URLSearchParams({ nodeId: CHANGE_LOG_NODE_ID, [RECORD_PARAM]: recordId })
  return `?${params.toString()}`
}
