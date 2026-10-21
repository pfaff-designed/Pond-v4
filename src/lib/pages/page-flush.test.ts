/**
 * Unit tests for the page-write registry's queue half (KAN-495).
 * `registerPageFlush`/`flushPendingPageSave` are unchanged and already
 * covered by their own callers' tests (kan-302-path, use-page-draft-flush).
 */

import { getPageWriteQueue } from './page-flush'

describe('getPageWriteQueue', () => {
  it('creates two different queues for two different page ids', () => {
    const createA = jest.fn(() => ({ id: 'a' }))
    const createB = jest.fn(() => ({ id: 'b' }))

    const queueA = getPageWriteQueue('page-a-1', createA)
    const queueB = getPageWriteQueue('page-a-2', createB)

    expect(createA).toHaveBeenCalledTimes(1)
    expect(createB).toHaveBeenCalledTimes(1)
    expect(queueA).not.toBe(queueB)
    expect(queueA).toEqual({ id: 'a' })
    expect(queueB).toEqual({ id: 'b' })
  })

  it('returns the same instance for the same page id across calls, never re-running the factory', () => {
    const create = jest.fn(() => ({ id: 'first' }))
    const createAgain = jest.fn(() => ({ id: 'second' }))

    const first = getPageWriteQueue('page-a-3', create)
    const second = getPageWriteQueue('page-a-3', createAgain)

    expect(first).toBe(second)
    expect(create).toHaveBeenCalledTimes(1)
    expect(createAgain).not.toHaveBeenCalled()
  })
})
