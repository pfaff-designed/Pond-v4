/**
 * `personFacingMessage` (KAN-303) — the one mapping from a thrown change-log
 * error to a line a person can read. Every branch here, plus the invariant
 * that none of them ever starts `change log:`.
 */

import { IllegalTransitionError } from '@/lib/change-log/status'
import {
  ALREADY_ANSWERED,
  RecordChangedError,
  RevertRefusedError,
  personFacingMessage,
} from '@/lib/change-log/errors'

describe('personFacingMessage', () => {
  it('maps IllegalTransitionError to the shared "already answered" line', () => {
    const err = new IllegalTransitionError('accepted', 'outdated')
    expect(err.message).toMatch(/^change log:/)
    expect(personFacingMessage(err)).toBe(ALREADY_ANSWERED)
  })

  it('maps RecordChangedError to the same shared line, from its own message', () => {
    const err = new RecordChangedError()
    expect(err.message).toBe(ALREADY_ANSWERED)
    expect(personFacingMessage(err)).toBe(ALREADY_ANSWERED)
  })

  it('maps a "waiting" RevertRefusedError', () => {
    const err = new RevertRefusedError('waiting', 'change log: record rec-1 already has a revert waiting on you')
    expect(personFacingMessage(err)).toBe('a revert of this change is already waiting')
  })

  it('maps a "not-revertable" RevertRefusedError', () => {
    const err = new RevertRefusedError(
      'not-revertable',
      'change log: record rec-1 cannot be reverted — not-accepted'
    )
    expect(personFacingMessage(err)).toBe('this change can no longer be reverted')
  })

  it('maps an "outdated-same-page" RevertRefusedError', () => {
    const err = new RevertRefusedError(
      'outdated-same-page',
      'change log: this change could not be set back against the page as it stands'
    )
    expect(personFacingMessage(err)).toBe("this change can't be set back against the page as it stands")
  })

  it('maps a bounded Postgres lock-wait timeout (57014)', () => {
    const err = { code: '57014', message: 'canceling statement due to statement timeout' }
    expect(personFacingMessage(err)).toBe('this page is busy — try again in a moment')
  })

  it('maps accept_revert_record’s stale-accept refusal (22023) to "already answered"', () => {
    const err = { code: '22023', message: 'only a proposed revert can be accepted' }
    expect(personFacingMessage(err)).toBe(ALREADY_ANSWERED)
  })

  it('falls back to a generic line for anything else', () => {
    expect(personFacingMessage(new Error('boom'))).toBe('that did not work')
    expect(personFacingMessage({ code: '23505' })).toBe('that did not work')
    expect(personFacingMessage(null)).toBe('that did not work')
    expect(personFacingMessage('a plain string')).toBe('that did not work')
  })

  it('never returns a string starting "change log:"', () => {
    const cases: unknown[] = [
      new IllegalTransitionError('proposed', 'proposed'),
      new RecordChangedError(),
      new RevertRefusedError('waiting', 'change log: already waiting'),
      new RevertRefusedError('not-revertable', 'change log: cannot be reverted'),
      new RevertRefusedError('outdated-same-page', 'change log: cannot be set back'),
      { code: '57014' },
      { code: '22023' },
      new Error('change log: some developer text'),
      {},
    ]
    for (const err of cases) {
      expect(personFacingMessage(err)).not.toMatch(/^change log:/)
    }
  })
})
