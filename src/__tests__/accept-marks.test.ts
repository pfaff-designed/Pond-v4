/**
 * `accept-marks` store (KAN-143) — session marks an accept leaves on a page.
 */

import {
  clear,
  consumeOnOpen,
  getSnapshot,
  recordAccept,
  registerPageOpen,
  removeByRecordId,
} from '@/lib/change-log/accept-marks'

describe('accept-marks', () => {
  afterEach(() => {
    clear()
  })

  it('accept while the page is open shows immediately, with no reopen needed', () => {
    const release = registerPageOpen('p1')
    consumeOnOpen('p1') // the mount's own first-open read, before any accept
    recordAccept('p1', ['block:a'], 'rec1', '2026-10-17T07:13:00.000Z')
    expect(getSnapshot('p1')).toEqual([
      { target: 'block:a', recordId: 'rec1', acceptedAt: '2026-10-17T07:13:00.000Z' },
    ])
    release()
  })

  it('accept while the page is closed shows nothing until the first open, then clears on the next', () => {
    recordAccept('p1', ['block:a'], 'rec1', '2026-10-17T07:13:00.000Z')
    const release = registerPageOpen('p1')
    expect(consumeOnOpen('p1')).toEqual([
      { target: 'block:a', recordId: 'rec1', acceptedAt: '2026-10-17T07:13:00.000Z' },
    ])
    release()
    const releaseAgain = registerPageOpen('p1')
    expect(consumeOnOpen('p1')).toEqual([])
    releaseAgain()
  })

  it('two targets from one accept are both present', () => {
    const release = registerPageOpen('p1')
    consumeOnOpen('p1')
    recordAccept('p1', ['block:a', 'block:t:row:1'], 'rec1', '2026-10-17T07:13:00.000Z')
    expect(getSnapshot('p1').map((mark) => mark.target).sort()).toEqual([
      'block:a',
      'block:t:row:1',
    ])
    release()
  })

  it('removeByRecordId drops only its own marks across two pages', () => {
    const releaseP1 = registerPageOpen('p1')
    const releaseP2 = registerPageOpen('p2')
    consumeOnOpen('p1')
    consumeOnOpen('p2')
    recordAccept('p1', ['block:a'], 'rec1', '2026-10-17T07:13:00.000Z')
    recordAccept('p2', ['block:b'], 'rec2', '2026-10-17T07:14:00.000Z')
    removeByRecordId('rec1')
    expect(getSnapshot('p1')).toEqual([])
    expect(getSnapshot('p2')).toEqual([
      { target: 'block:b', recordId: 'rec2', acceptedAt: '2026-10-17T07:14:00.000Z' },
    ])
    releaseP1()
    releaseP2()
  })

  it('a second accept on the same target replaces it rather than duplicating', () => {
    const release = registerPageOpen('p1')
    consumeOnOpen('p1')
    recordAccept('p1', ['block:a'], 'rec1', '2026-10-17T07:13:00.000Z')
    recordAccept('p1', ['block:a'], 'rec2', '2026-10-17T07:20:00.000Z')
    expect(getSnapshot('p1')).toEqual([
      { target: 'block:a', recordId: 'rec2', acceptedAt: '2026-10-17T07:20:00.000Z' },
    ])
    release()
  })
})
