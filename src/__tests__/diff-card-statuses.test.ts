/**
 * @jest-environment node
 *
 * Issue #98 — the eight statuses reach the card.
 *
 * The DB has carried all eight since migration 0011 and the state machine in
 * `status.ts` walks them, but the card's decision type knew only accepted and
 * rejected. These tests pin the three pure pieces that close that gap:
 *
 *   - `labelForStatus` — one human label per status, shared by the card's
 *     status line and the "changes to this page" rows so the two never drift;
 *   - `batchStatus` — a propose_changes card decides as a WHOLE (accept and
 *     reject take the whole diff; partial acceptance goes through request
 *     changes), so the per-index envelope folds to one card status;
 *   - `reconcileCardStatus` — what the card adopts when the change log knows
 *     more than the session does (G2: the target was edited → `outdated`).
 */

import { CHANGE_LOG_STATUSES, type ChangeLogStatus } from '@/lib/change-log/types'
import { labelForStatus } from '@/lib/change-log/status'
import { batchStatus, reconcileCardStatus } from '@/lib/conversation/proposals'
import { parseResolutions, type ProposalDecision } from '@/lib/conversation/resolutions'

describe('labelForStatus — one label per status (W6)', () => {
  it('names all eight, lowercase, with the underscore spelled out', () => {
    const labels = CHANGE_LOG_STATUSES.map(labelForStatus)
    expect(labels).toEqual([
      'proposed',
      'accepted',
      'rejected',
      'changes requested',
      'outdated',
      'withdrawn',
      'undone',
      'reverted',
    ])
    // Distinct: no two statuses collapse to the same word.
    expect(new Set(labels).size).toBe(CHANGE_LOG_STATUSES.length)
  })
})

describe('batchStatus — the card decides as a whole', () => {
  it('is pending while every change is undecided', () => {
    expect(batchStatus({}, 'pc1', 2)).toBe('pending')
  })

  it('is the shared decision when every index agrees', () => {
    expect(batchStatus({ 'pc1:0': 'rejected', 'pc1:1': 'rejected' }, 'pc1', 2)).toBe('rejected')
    expect(
      batchStatus({ 'pc1:0': 'changes_requested', 'pc1:1': 'changes_requested' }, 'pc1', 2)
    ).toBe('changes_requested')
  })

  it('a legacy partial accept reads as accepted — something landed', () => {
    // Pre-#98 envelopes could hold per-change splits. Nothing is rewritten; the
    // card just has to pick one word, and "accepted" is the honest one when any
    // change reached the page.
    expect(batchStatus({ 'pc1:0': 'accepted', 'pc1:1': 'rejected' }, 'pc1', 2)).toBe('accepted')
    expect(batchStatus({ 'pc1:1': 'accepted' }, 'pc1', 2)).toBe('accepted')
  })

  it('a legacy partial reject with the rest pending reads as rejected', () => {
    expect(batchStatus({ 'pc1:0': 'rejected' }, 'pc1', 2)).toBe('rejected')
  })

  it('an empty batch is pending (nothing to decide)', () => {
    expect(batchStatus({}, 'pc1', 0)).toBe('pending')
  })
})

describe('reconcileCardStatus — the log knows more than the session', () => {
  it('a pending card adopts whatever settled status the log holds', () => {
    const settled: ChangeLogStatus[] = [
      'accepted',
      'rejected',
      'changes_requested',
      'outdated',
      'withdrawn',
    ]
    for (const remote of settled) {
      expect(reconcileCardStatus('pending', remote)).toBe(remote)
    }
  })

  it('a pending card stays pending while the log still says proposed', () => {
    expect(reconcileCardStatus('pending', 'proposed')).toBeNull()
  })

  it('an accepted card follows the log into undone or reverted — and nowhere else', () => {
    expect(reconcileCardStatus('accepted', 'undone')).toBe('undone')
    expect(reconcileCardStatus('accepted', 'reverted')).toBe('reverted')
    // The session's own accept is the truth over a stale read of the record.
    expect(reconcileCardStatus('accepted', 'proposed')).toBeNull()
    expect(reconcileCardStatus('accepted', 'accepted')).toBeNull()
    expect(reconcileCardStatus('accepted', 'outdated')).toBeNull()
  })

  it('an undone card follows the chain back to accepted once a redo lands (KAN-302)', () => {
    expect(reconcileCardStatus('undone', 'accepted')).toBe('accepted')
    // Still held in the session until the chain says otherwise.
    expect(reconcileCardStatus('undone', 'proposed')).toBeNull()
    expect(reconcileCardStatus('undone', 'undone')).toBeNull()
  })

  it('every other settled card is left alone', () => {
    expect(reconcileCardStatus('rejected', 'outdated')).toBeNull()
    expect(reconcileCardStatus('changes_requested', 'outdated')).toBeNull()
    expect(reconcileCardStatus('outdated', 'accepted')).toBeNull()
    expect(reconcileCardStatus('withdrawn', 'accepted')).toBeNull()
  })
})

describe('the envelope carries all seven settled decisions', () => {
  it('parseResolutions keeps every non-proposed status and drops proposed', () => {
    const settled: ProposalDecision[] = [
      'accepted',
      'rejected',
      'changes_requested',
      'outdated',
      'withdrawn',
      'undone',
      'reverted',
    ]
    const changes = Object.fromEntries(settled.map((s, i) => [`pc1:${i}`, s]))
    const parsed = parseResolutions({
      changes: { ...changes, 'pc1:9': 'proposed', 'pc1:8': 'nope' },
    })
    expect(parsed.changes).toEqual(changes)
  })

  it('carries request-changes notes and revision links only when present', () => {
    expect(parseResolutions({})).not.toHaveProperty('changeNotes')
    expect(parseResolutions({})).not.toHaveProperty('revisions')
    const parsed = parseResolutions({
      changeNotes: { pc1: 'keep the electrician, drop the worktop', pc2: 7 },
      revisions: { pc3: 'pc1', pc4: null },
    })
    expect(parsed.changeNotes).toEqual({ pc1: 'keep the electrician, drop the worktop' })
    expect(parsed.revisions).toEqual({ pc3: 'pc1' })
  })
})
