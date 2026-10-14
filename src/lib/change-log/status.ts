/**
 * The change-log status state machine (issue #102, spec #110).
 *
 * The log only grows, so this machine is deliberately tiny: a record's status
 * advances at most ONCE off `proposed`, and everything that looks like an edit
 * to history — revise, revert, undo, redo — is a NEW record that links back
 * (see `ChangeLogLinks`). Nothing here mutates; these are pure predicates the
 * store asserts against before it issues an update.
 *
 * The graph, straight from the spec:
 *
 *   proposed ──▶ accepted | rejected | changes_requested | withdrawn | outdated
 *   accepted ──▶ undone (session undo, #104) | reverted (revert-from-log, #103)
 *   changes_requested ──▶ ∅   revise inserts a NEW `proposed` record
 *                             (links.revisedFrom = this id); the original stays
 *   outdated ──▶ rejected     accept is withdrawn, revise inserts anew, but the
 *                             proposed view still needs a way to clear the card
 *                             (KAN-96, s6o2's outdated row draws revise · reject)
 *   rejected · withdrawn · undone · reverted ──▶ ∅   settled for good
 *
 * Pure — no Supabase, no React.
 */

import { CHANGE_LOG_STATUSES, type ChangeLogStatus } from './types'

/** Every legal `from → to` edge. An empty list means the status is terminal. */
export const LEGAL_TRANSITIONS: Readonly<Record<ChangeLogStatus, readonly ChangeLogStatus[]>> = {
  proposed: ['accepted', 'rejected', 'changes_requested', 'withdrawn', 'outdated'],
  // Accepted work can still be taken back — but only by a later record that
  // links to it, which is what stamps these two.
  accepted: ['undone', 'reverted'],
  rejected: [],
  // A revision is a new record; this one is finished either way.
  changes_requested: [],
  // The RPC is a status CAS and enforces no legality of its own — this one
  // edge exists so the proposed view can clear a card it can no longer
  // accept (reject), without touching the RPC or adding a migration.
  outdated: ['rejected'],
  withdrawn: [],
  undone: [],
  reverted: [],
}

/** The statuses nothing can advance out of. */
export const TERMINAL_STATUSES: readonly ChangeLogStatus[] = CHANGE_LOG_STATUSES.filter(
  (s) => LEGAL_TRANSITIONS[s].length === 0
)

/** `proposed` is the only status still waiting on a person's *first* decision —
 *  the set `listRecords({status:'proposed'})` returns. The change log page's
 *  own "N proposed, waiting on you" figure counts the wider {@link WAITING_STATUSES}
 *  set instead, since an `outdated` record still needs a decision (revise). */
export function isOpen(status: ChangeLogStatus): boolean {
  return status === 'proposed'
}

/** Both statuses still waiting on a person's decision — the set `countWaiting`
 *  counts and a change-log row's pill/plain status split reads. `outdated`
 *  keeps an accept withdrawn but a revise offered, so it still counts as
 *  waiting (KAN-94). */
export const WAITING_STATUSES: readonly ChangeLogStatus[] = ['proposed', 'outdated']

/** Settled = decided, one way or another. The complement of {@link isOpen}. */
export function isSettled(status: ChangeLogStatus): boolean {
  return !isOpen(status)
}

/**
 * Can this record still be accepted? Only a live `proposed` one — an `outdated`
 * record has its accept affordance withdrawn by design (revise is offered
 * instead), which is spec #110 acceptance criterion 5.
 */
export function canAccept(status: ChangeLogStatus): boolean {
  return status === 'proposed'
}

/**
 * Can a fresh `proposed` record be offered in this one's place? The design says
 * both request-changes and outdated lead to "Pond offers to revise it".
 */
export function canRevise(status: ChangeLogStatus): boolean {
  return status === 'changes_requested' || status === 'outdated'
}

/**
 * Can this record still be rejected? Both statuses `WAITING_STATUSES` keeps in
 * the proposed view — a live `proposed` one, or an `outdated` one whose accept
 * is withdrawn but still needs a way to leave the view (KAN-96).
 */
export function canReject(status: ChangeLogStatus): boolean {
  return status === 'proposed' || status === 'outdated'
}

/**
 * The one human label per status (W6), shared by the diff card's status line
 * and the "changes to this page" rows so the two can never drift. Lowercase —
 * both are machine surfaces — with the underscore spelled out.
 */
export function labelForStatus(status: ChangeLogStatus): string {
  return status === 'changes_requested' ? 'changes requested' : status
}

/** Is `from → to` an edge in the graph above? */
export function canTransition(from: ChangeLogStatus, to: ChangeLogStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

/** Raised when a caller tries to walk an edge the machine does not have. */
export class IllegalTransitionError extends Error {
  constructor(
    readonly from: ChangeLogStatus,
    readonly to: ChangeLogStatus
  ) {
    const legal = LEGAL_TRANSITIONS[from]
    super(
      legal.length === 0
        ? `change log: '${from}' is terminal — '${to}' would rewrite history; insert a new linked record instead`
        : `change log: '${from}' cannot become '${to}' (legal: ${legal.join(', ')})`
    )
    this.name = 'IllegalTransitionError'
  }
}

/** Throw unless `from → to` is legal. The store's guard before every update. */
export function assertTransition(from: ChangeLogStatus, to: ChangeLogStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to)
}
