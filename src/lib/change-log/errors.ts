/**
 * Person-facing lines for change-log errors (KAN-303).
 *
 * The change-log store and revert module throw developer text (`change log:
 * …`) so a `console.error` or a failing test says exactly what broke. Nothing
 * that reaches a person should ever see that text — {@link personFacingMessage}
 * is the one mapping from a thrown error to a line a person can read, and it
 * never returns a string starting `change log:`.
 *
 * Lives below `store.ts` and `revert.ts` in the import graph (neither imports
 * from here) so both can import this without a cycle.
 */

import { IllegalTransitionError } from './status'

/** The line for every "someone already answered this" race — the client's own
 *  pre-check, the advance RPC's compare-and-swap, and `accept_revert_record`'s
 *  own "not proposed anymore" refusal all land here. */
export const ALREADY_ANSWERED = 'this change was already answered'

/** Raised by the compare-and-swap RPCs' own `record-changed` DETAIL. */
export class RecordChangedError extends Error {
  constructor() {
    super(ALREADY_ANSWERED)
    this.name = 'RecordChangedError'
  }
}

export type RevertRefusalReason = 'waiting' | 'not-revertable' | 'outdated-same-page'

const REVERT_REFUSAL_MESSAGES: Readonly<Record<RevertRefusalReason, string>> = {
  waiting: 'a revert of this change is already waiting',
  'not-revertable': 'this change can no longer be reverted',
  'outdated-same-page': "this change can't be set back against the page as it stands",
}

/** Raised by `proposeRevert`'s own refusals, before any RPC — carries developer
 *  text as its `message` (for logging) and a `reason` the panel maps to a line. */
export class RevertRefusedError extends Error {
  constructor(readonly reason: RevertRefusalReason, message: string) {
    super(message)
    this.name = 'RevertRefusedError'
  }
}

/** `trash_page` / `restore_page`'s own DETAIL reasons (KAN-97), read by `trash.ts`. */
export type TrashRefusalReason = 'not-found' | 'page-gone' | 'already-restored' | 'not-trashable'

const TRASH_REFUSAL_MESSAGES: Readonly<Record<TrashRefusalReason, string>> = {
  'not-found': 'that page could not be found',
  'page-gone': 'that page no longer exists',
  'already-restored': 'that page has already been restored',
  // `trash_page` raises this same DETAIL for both the pond's root page and
  // its databases root — neither is ever trashable, so one line covers both.
  'not-trashable': "the pond's root page or its databases root can't be moved to trash",
}

/** Raised by `trash.ts` once it has read a known DETAIL off `trash_page` /
 *  `restore_page`'s own refusal — carries developer text as its `message`
 *  (for logging) and a `reason` the panel maps to a line. */
export class TrashRefusedError extends Error {
  constructor(readonly reason: TrashRefusalReason, message: string) {
    super(message)
    this.name = 'TrashRefusedError'
  }
}

/**
 * `57014` is Postgres's SQLSTATE for `query_canceled` — a bounded (~8s) lock
 * wait, not a hang, raised for a statement or lock timeout and reaching here
 * as a `PostgrestError`-shaped object, not an `Error` instance.
 *
 * `22023` (`invalid_parameter_value`) is `accept_revert_record`'s own refusal
 * when the revert is no longer `proposed` — a stale accept after another tab
 * already rejected it (migration 0025), the same two-tab race every other
 * refusal here reports.
 */
function postgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

/** Map a thrown error to the one line a person should see. Never returns a
 *  string starting `change log:`. */
export function personFacingMessage(err: unknown): string {
  if (err instanceof IllegalTransitionError || err instanceof RecordChangedError) {
    return ALREADY_ANSWERED
  }
  if (err instanceof RevertRefusedError) {
    return REVERT_REFUSAL_MESSAGES[err.reason]
  }
  if (err instanceof TrashRefusedError) {
    return TRASH_REFUSAL_MESSAGES[err.reason]
  }
  const code = postgresCode(err)
  if (code === '57014') return 'this page is busy — try again in a moment'
  if (code === '22023') return ALREADY_ANSWERED
  return 'that did not work'
}
