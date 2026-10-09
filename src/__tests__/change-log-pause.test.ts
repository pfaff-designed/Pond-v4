/**
 * Grouping by pause — the one definition of "one edit" the change log records.
 * A run of edits to the same thing with no pause between them is ONE record:
 * its `before` is what stood before the first edit, its `after` what the last
 * one left.
 */

import { EDIT_PAUSE_MS, groupByPause } from '@/lib/change-log/pause'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('groupByPause', () => {
  it('closes a run of edits into one group when the person pauses', () => {
    const onPause = jest.fn()
    const groups = groupByPause<string>(onPause)

    groups.note('row-1', 'a', 'ab')
    jest.advanceTimersByTime(EDIT_PAUSE_MS - 1)
    groups.note('row-1', 'ab', 'abc')
    jest.advanceTimersByTime(EDIT_PAUSE_MS - 1)
    expect(onPause).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onPause).toHaveBeenCalledWith('a', 'abc')
  })

  it('keeps separate things in separate groups', () => {
    const onPause = jest.fn()
    const groups = groupByPause<string>(onPause)

    groups.note('row-1', 'a', 'b')
    groups.note('row-2', 'x', 'y')
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledTimes(2)
    expect(onPause).toHaveBeenCalledWith('a', 'b')
    expect(onPause).toHaveBeenCalledWith('x', 'y')
  })

  it('starts a new group after a pause', () => {
    const onPause = jest.fn()
    const groups = groupByPause<string>(onPause)

    groups.note('row-1', 'a', 'b')
    jest.advanceTimersByTime(EDIT_PAUSE_MS)
    groups.note('row-1', 'b', 'c')
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause.mock.calls).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ])
  })

  it('keeps a null before — a run that began by creating the thing', () => {
    const onPause = jest.fn()
    const groups = groupByPause<string>(onPause)

    groups.note('row-1', null, '')
    groups.note('row-1', '', 'chickpeas')
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith(null, 'chickpeas')
  })

  it('drops a discarded group without closing it', () => {
    const onPause = jest.fn()
    const groups = groupByPause<string>(onPause)

    groups.note('row-1', 'a', 'b')
    groups.discard('row-1')
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).not.toHaveBeenCalled()
  })

  it('flush closes every open group now', () => {
    const onPause = jest.fn()
    const groups = groupByPause<string>(onPause)

    groups.note('row-1', 'a', 'b')
    groups.note('row-2', 'x', 'y')
    groups.flush()
    expect(onPause).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(EDIT_PAUSE_MS)
    expect(onPause).toHaveBeenCalledTimes(2)
  })
})
