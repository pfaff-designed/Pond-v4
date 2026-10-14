/**
 * The change-log status state machine (issue #102, spec #110).
 *
 * The machine is the "only grows" rule expressed as a graph: a record advances
 * at most once off `proposed`, and every operation that LOOKS like editing
 * history — revise, revert, undo, redo — is an illegal edge here precisely
 * because it must be a new linked record instead.
 */

import {
  LEGAL_TRANSITIONS,
  TERMINAL_STATUSES,
  IllegalTransitionError,
  assertTransition,
  canAccept,
  canReject,
  canRevise,
  canTransition,
  isOpen,
  isSettled,
} from '@/lib/change-log/status'
import { CHANGE_LOG_STATUSES, isChangeLogStatus } from '@/lib/change-log/types'

describe('the eight statuses', () => {
  it('is exactly the eight the design names, in the design’s order', () => {
    expect(CHANGE_LOG_STATUSES).toEqual([
      'proposed',
      'accepted',
      'rejected',
      'changes_requested',
      'outdated',
      'withdrawn',
      'undone',
      'reverted',
    ])
    expect(new Set(CHANGE_LOG_STATUSES).size).toBe(8)
  })

  it('guards against a ninth', () => {
    for (const s of CHANGE_LOG_STATUSES) expect(isChangeLogStatus(s)).toBe(true)
    for (const s of ['pending', 'changes requested', 'Accepted', '', null, undefined, 7]) {
      expect(isChangeLogStatus(s)).toBe(false)
    }
  })

  it('gives every status an entry in the graph', () => {
    expect(Object.keys(LEGAL_TRANSITIONS).sort()).toEqual([...CHANGE_LOG_STATUSES].sort())
  })
})

describe('legal transitions', () => {
  it('lets a proposal be accepted, rejected, sent back, withdrawn or outdated', () => {
    expect([...LEGAL_TRANSITIONS.proposed].sort()).toEqual([
      'accepted',
      'changes_requested',
      'outdated',
      'rejected',
      'withdrawn',
    ])
  })

  it('lets accepted work be taken back only by undo or revert', () => {
    expect([...LEGAL_TRANSITIONS.accepted].sort()).toEqual(['reverted', 'undone'])
  })

  it('treats every settled status as terminal — a revision is a NEW record', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual([
      'changes_requested',
      'rejected',
      'reverted',
      'undone',
      'withdrawn',
    ])
    for (const from of TERMINAL_STATUSES) {
      for (const to of CHANGE_LOG_STATUSES) {
        expect(canTransition(from, to)).toBe(false)
      }
    }
  })

  it('lets an outdated card clear to rejected only — its accept is withdrawn, but the proposed view still needs a way to drop it (KAN-96)', () => {
    expect(canTransition('outdated', 'rejected')).toBe(true)
    for (const to of CHANGE_LOG_STATUSES.filter((s) => s !== 'rejected')) {
      expect(canTransition('outdated', to)).toBe(false)
    }
  })

  it('never lets anything return to proposed — that would rewrite history', () => {
    for (const from of CHANGE_LOG_STATUSES) {
      expect(canTransition(from, 'proposed')).toBe(false)
    }
  })

  it('never lets a status transition to itself', () => {
    for (const from of CHANGE_LOG_STATUSES) {
      expect(canTransition(from, from)).toBe(false)
    }
  })

  it('refuses to accept an outdated record — its accept affordance is withdrawn (G2)', () => {
    expect(canTransition('outdated', 'accepted')).toBe(false)
    expect(canAccept('outdated')).toBe(false)
    expect(canAccept('proposed')).toBe(true)
    for (const s of ['accepted', 'rejected', 'changes_requested', 'withdrawn'] as const) {
      expect(canAccept(s)).toBe(false)
    }
  })

  it('offers reject on both statuses WAITING_STATUSES keeps in the proposed view: proposed and outdated', () => {
    expect(canReject('proposed')).toBe(true)
    expect(canReject('outdated')).toBe(true)
    for (const s of [
      'accepted',
      'rejected',
      'changes_requested',
      'withdrawn',
      'undone',
      'reverted',
    ] as const) {
      expect(canReject(s)).toBe(false)
    }
  })

  it('offers revise exactly where the design does: changes_requested and outdated', () => {
    expect(canRevise('changes_requested')).toBe(true)
    expect(canRevise('outdated')).toBe(true)
    for (const s of [
      'proposed',
      'accepted',
      'rejected',
      'withdrawn',
      'undone',
      'reverted',
    ] as const) {
      expect(canRevise(s)).toBe(false)
    }
  })
})

describe('open vs settled', () => {
  it('counts only proposed as still waiting on you', () => {
    expect(isOpen('proposed')).toBe(true)
    expect(isSettled('proposed')).toBe(false)
    for (const s of CHANGE_LOG_STATUSES.filter((x) => x !== 'proposed')) {
      expect(isOpen(s)).toBe(false)
      expect(isSettled(s)).toBe(true)
    }
  })
})

describe('assertTransition', () => {
  it('passes a legal edge silently', () => {
    expect(() => assertTransition('proposed', 'accepted')).not.toThrow()
    expect(() => assertTransition('accepted', 'reverted')).not.toThrow()
  })

  it('throws IllegalTransitionError carrying both ends', () => {
    try {
      assertTransition('rejected', 'accepted')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError)
      const e = err as IllegalTransitionError
      expect(e.from).toBe('rejected')
      expect(e.to).toBe('accepted')
      // A terminal status gets the message that names the remedy.
      expect(e.message).toMatch(/terminal/)
      expect(e.message).toMatch(/insert a new linked record/)
    }
  })

  it('lists the one legal edge when the source is outdated, not terminal', () => {
    expect(() => assertTransition('outdated', 'accepted')).toThrow(/legal: rejected/)
  })

  it('lists the legal edges when the source is not terminal', () => {
    expect(() => assertTransition('proposed', 'undone')).toThrow(/legal: accepted, rejected/)
  })
})
