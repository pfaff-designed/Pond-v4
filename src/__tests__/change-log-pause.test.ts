/**
 * Grouping by pause — the one definition of "one edit" the change log records.
 * A run of changes to the same thing with no pause between them is ONE record,
 * and a change only counts once its write has landed: the group waits for its
 * in-flight writes, a refused write drops that change alone, and the next
 * group starts from what was actually stored.
 */

import { EDIT_PAUSE_MS, groupByPause } from '@/lib/change-log/pause'

type Fields = Record<string, string>
interface Patch {
  field: string
  value: string
}

const apply = (state: Fields | null, patch: Patch): Fields => ({
  ...(state ?? {}),
  [patch.field]: patch.value,
})

const deferred = () => {
  let resolve: () => void = () => {}
  let reject: (err: Error) => void = () => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const landed = () => Promise.resolve()
const refused = () => Promise.reject(new Error('rls'))

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const setup = () => {
  const onPause = jest.fn()
  const groups = groupByPause<Fields, Patch, string>({ apply, onPause })
  const change = (
    key: string,
    current: Fields | null,
    patch: Patch,
    write: Promise<unknown>,
    origin: string | null = 'pond-1'
  ) => groups.change({ key, current, patch, write, origin })
  return { onPause, groups, change }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('groupByPause', () => {
  it('closes a run of landed changes into one group when the person pauses', async () => {
    const { onPause, change } = setup()

    change('row-1', { status: 'want' }, { field: 'status', value: 'w' }, landed())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS - 1)
    change('row-1', { status: 'w' }, { field: 'status', value: 'weeknight' }, landed())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS - 1)
    expect(onPause).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onPause).toHaveBeenCalledWith({ status: 'want' }, { status: 'weeknight' }, 'pond-1')
  })

  it('waits past the pause for a write still in flight, then counts it', async () => {
    const { onPause, change } = setup()
    const slow = deferred()

    change('row-1', { status: 'want' }, { field: 'status', value: 'weeknight' }, slow.promise)
    jest.advanceTimersByTime(EDIT_PAUSE_MS * 3)
    await settle()
    expect(onPause).not.toHaveBeenCalled()

    slow.resolve()
    await settle()
    expect(onPause).toHaveBeenCalledWith({ status: 'want' }, { status: 'weeknight' }, 'pond-1')
  })

  it('a write refused after the pause is never logged', async () => {
    const { onPause, change } = setup()
    const slow = deferred()

    change('row-1', { status: 'want' }, { field: 'status', value: 'weeknight' }, slow.promise)
    jest.advanceTimersByTime(EDIT_PAUSE_MS * 3)
    slow.reject(new Error('rls'))
    await settle()

    expect(onPause).not.toHaveBeenCalled()
  })

  it('a refused change drops itself alone — the changes that landed stay', async () => {
    const { onPause, change } = setup()

    change('row-1', { status: 'want', title: 'dal' }, { field: 'status', value: 'cook' }, landed())
    change('row-1', null, { field: 'title', value: 'dal, weeknight' }, refused())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith(
      { status: 'want', title: 'dal' },
      { status: 'cook', title: 'dal' },
      'pond-1'
    )
  })

  it('applies changes in the order they were made, whatever order they land in', async () => {
    const { onPause, change } = setup()
    const first = deferred()
    const second = deferred()

    change('row-1', { status: 'want' }, { field: 'status', value: 'we' }, first.promise)
    change('row-1', null, { field: 'status', value: 'weeknight' }, second.promise)
    second.resolve()
    await settle()
    first.resolve()
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith({ status: 'want' }, { status: 'weeknight' }, 'pond-1')
  })

  it('starts the next group from what was stored, not from a refused value still held', async () => {
    const { onPause, change } = setup()

    change('row-1', { status: 'want' }, { field: 'status', value: 'refused' }, refused())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)
    expect(onPause).not.toHaveBeenCalled()

    // The view still holds the refused value: nothing has reloaded it yet.
    change('row-1', { status: 'refused' }, { field: 'status', value: 'cook' }, landed())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith({ status: 'want' }, { status: 'cook' }, 'pond-1')
  })

  it('trusts the view again once it no longer holds the refused value', async () => {
    const { onPause, change } = setup()

    change('row-1', { status: 'want' }, { field: 'status', value: 'refused' }, refused())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    // Reloaded since — and someone else's edit landed in between.
    change('row-1', { status: 'elsewhere' }, { field: 'status', value: 'cook' }, landed())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith({ status: 'elsewhere' }, { status: 'cook' }, 'pond-1')
  })

  it('keeps separate things in separate groups', async () => {
    const { onPause, change } = setup()

    change('row-1', { status: 'a' }, { field: 'status', value: 'b' }, landed())
    change('row-2', { status: 'x' }, { field: 'status', value: 'y' }, landed())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledTimes(2)
  })

  it('keeps a null before — a run that began by creating the thing', async () => {
    const { onPause, change } = setup()

    change('row-1', null, { field: 'title', value: '' }, landed())
    change('row-1', { title: '' }, { field: 'title', value: 'chickpeas' }, landed())
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith(null, { title: 'chickpeas' }, 'pond-1')
  })

  it('drop discards the group, even when its writes land afterwards', async () => {
    const { onPause, groups, change } = setup()
    const slow = deferred()

    change('row-1', { status: 'a' }, { field: 'status', value: 'b' }, slow.promise)
    groups.drop('row-1')
    slow.resolve()
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).not.toHaveBeenCalled()
  })

  it('flush closes every group without waiting for the pause, but still waits for its writes', async () => {
    const { onPause, groups, change } = setup()
    const slow = deferred()

    change('row-1', { status: 'a' }, { field: 'status', value: 'b' }, landed())
    change('row-2', { status: 'x' }, { field: 'status', value: 'y' }, slow.promise)
    await settle()
    groups.flush()
    expect(onPause).toHaveBeenCalledTimes(1)

    slow.resolve()
    await settle()
    expect(onPause).toHaveBeenCalledTimes(2)
  })

  it('logs under the pond the changes were made in, keeping it once known', async () => {
    const { onPause, change } = setup()

    change('row-1', { status: 'a' }, { field: 'status', value: 'b' }, landed(), null)
    change('row-1', null, { field: 'status', value: 'c' }, landed(), 'pond-2')
    change('row-1', null, { field: 'status', value: 'd' }, landed(), null)
    await settle()
    jest.advanceTimersByTime(EDIT_PAUSE_MS)

    expect(onPause).toHaveBeenCalledWith({ status: 'a' }, { status: 'd' }, 'pond-2')
  })
})
