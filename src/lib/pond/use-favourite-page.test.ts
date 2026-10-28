import { act, renderHook } from '@testing-library/react'

const patchPond = jest.fn()
const requestNotify = jest.fn()
let pond: { id: string; favouritePageIds?: string[] } | null = {
  id: 'p-life',
  favouritePageIds: ['a', 'b'],
}

const rememberReorder = jest.fn()

jest.mock('./context', () => ({ usePond: () => ({ pond, patchPond }) }))
jest.mock('./client', () => ({ setPondFavourites: jest.fn() }))
jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: (...args: unknown[]) => requestNotify(...args) }))
jest.mock('./favourites-undo', () => ({ rememberReorder: (...args: unknown[]) => rememberReorder(...args) }))

import { setPondFavourites } from './client'
import { useFavouritePage } from './use-favourite-page'

const setFavourites = setPondFavourites as jest.Mock

beforeEach(() => {
  patchPond.mockClear()
  requestNotify.mockClear()
  rememberReorder.mockClear()
  setFavourites.mockReset()
  pond = { id: 'p-life', favouritePageIds: ['a', 'b'] }
})

describe('useFavouritePage', () => {
  it('applies the toggled ids optimistically before the write settles', async () => {
    let finish: () => void = () => {}
    setFavourites.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useFavouritePage())

    const toggled = act(async () => {
      const call = result.current.toggle('c')
      finish()
      await call
    })
    await toggled

    expect(patchPond).toHaveBeenCalledWith('p-life', { favouritePageIds: ['a', 'b', 'c'] })
    expect(setFavourites).toHaveBeenCalledWith('p-life', ['a', 'b', 'c'])
    expect(requestNotify).not.toHaveBeenCalled()
  })

  it('rolls back to the pre-toggle ids and toasts when the write is rejected', async () => {
    setFavourites.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useFavouritePage())

    await act(async () => {
      await result.current.toggle('a')
    })

    expect(patchPond).toHaveBeenNthCalledWith(1, 'p-life', { favouritePageIds: ['b'] })
    expect(patchPond).toHaveBeenNthCalledWith(2, 'p-life', { favouritePageIds: ['a', 'b'] })
    expect(requestNotify).toHaveBeenCalledWith({ message: 'Could not update favourites' })
  })

  it('keeps the newest intent when a second toggle lands while the first write is in flight', async () => {
    let finishFirst: () => void = () => {}
    setFavourites.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
    setFavourites.mockImplementationOnce(() => Promise.resolve())
    const { result } = renderHook(() => useFavouritePage())

    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.toggle('c')
      second = result.current.toggle('c')
    })

    // Both toggles already applied optimistically — nothing was dropped.
    expect(patchPond).toHaveBeenNthCalledWith(1, 'p-life', { favouritePageIds: ['a', 'b', 'c'] })
    expect(patchPond).toHaveBeenNthCalledWith(2, 'p-life', { favouritePageIds: ['a', 'b'] })

    finishFirst()
    await act(async () => {
      await Promise.all([first, second])
    })

    expect(setFavourites).toHaveBeenCalledTimes(2)
    expect(setFavourites).toHaveBeenNthCalledWith(1, 'p-life', ['a', 'b', 'c'])
    expect(setFavourites).toHaveBeenNthCalledWith(2, 'p-life', ['a', 'b'])
    expect(patchPond).toHaveBeenCalledTimes(2)
    expect(requestNotify).not.toHaveBeenCalled()
  })

  it('applies a reordered list optimistically, writes it, and stashes the pre-reorder order', async () => {
    setFavourites.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useFavouritePage())

    await act(async () => {
      await result.current.reorder(['b', 'a'])
    })

    expect(patchPond).toHaveBeenCalledWith('p-life', { favouritePageIds: ['b', 'a'] })
    expect(setFavourites).toHaveBeenCalledWith('p-life', ['b', 'a'])
    expect(rememberReorder).toHaveBeenCalledWith('p-life', ['a', 'b'])
    expect(requestNotify).not.toHaveBeenCalled()
  })

  it('rolls back a rejected reorder to the pre-reorder ids and toasts', async () => {
    setFavourites.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useFavouritePage())

    await act(async () => {
      await result.current.reorder(['b', 'a'])
    })

    expect(patchPond).toHaveBeenNthCalledWith(1, 'p-life', { favouritePageIds: ['b', 'a'] })
    expect(patchPond).toHaveBeenNthCalledWith(2, 'p-life', { favouritePageIds: ['a', 'b'] })
    expect(requestNotify).toHaveBeenCalledWith({ message: 'Could not update favourites' })
  })

  it('does not stash a pending reorder when recordUndo is false, and resolves true on success', async () => {
    setFavourites.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useFavouritePage())

    let resolved: boolean = false
    await act(async () => {
      resolved = await result.current.reorder(['b', 'a'], { recordUndo: false })
    })

    expect(setFavourites).toHaveBeenCalledWith('p-life', ['b', 'a'])
    expect(rememberReorder).not.toHaveBeenCalled()
    expect(resolved).toBe(true)
  })

  it('resolves false on a rejected recordUndo: false reorder, so the caller can re-stash it', async () => {
    setFavourites.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useFavouritePage())

    let resolved: boolean = true
    await act(async () => {
      resolved = await result.current.reorder(['b', 'a'], { recordUndo: false })
    })

    expect(rememberReorder).not.toHaveBeenCalled()
    expect(resolved).toBe(false)
  })

  it('serializes a reorder from one mount and an undo reorder from another, so the undo write is never fired concurrently', async () => {
    let resolveDrag: () => void = () => {}
    setFavourites.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveDrag = resolve)))
    setFavourites.mockImplementationOnce(() => Promise.resolve())

    // Rail's mount drags roof to the top; ShellCommands' mount is a separate
    // component instance, the same way the real tree splits them.
    const rail = renderHook(() => useFavouritePage())
    const shellCommands = renderHook(() => useFavouritePage())

    let dragDone: Promise<boolean> = Promise.resolve(true)
    act(() => {
      dragDone = rail.result.current.reorder(['b', 'a'])
    })

    let undoDone: Promise<boolean> = Promise.resolve(true)
    act(() => {
      undoDone = shellCommands.result.current.reorder(['a', 'b'], { recordUndo: false })
    })

    // The undo's write must queue behind the drag's in-flight write, not
    // fire a second concurrent request whose own response order would decide
    // what lands last on the server.
    expect(setFavourites).toHaveBeenCalledTimes(1)

    resolveDrag()
    await act(async () => {
      await Promise.all([dragDone, undoDone])
    })

    expect(setFavourites).toHaveBeenCalledTimes(2)
    expect(setFavourites).toHaveBeenNthCalledWith(1, 'p-life', ['b', 'a'])
    expect(setFavourites).toHaveBeenNthCalledWith(2, 'p-life', ['a', 'b'])
  })

  it('does not resolve a queued reorder until its own write settles, and resolves false on rejection so the slot can be restored', async () => {
    let resolveDrag: () => void = () => {}
    setFavourites.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveDrag = resolve)))
    let rejectUndo: (err: Error) => void = () => {}
    setFavourites.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (rejectUndo = reject)))

    const rail = renderHook(() => useFavouritePage())
    const shellCommands = renderHook(() => useFavouritePage())

    let dragDone: Promise<boolean> = Promise.resolve(true)
    act(() => {
      dragDone = rail.result.current.reorder(['b', 'a'])
    })

    let undoDone: Promise<boolean> = Promise.resolve(true)
    let undoSettled = false
    act(() => {
      undoDone = shellCommands.result.current.reorder(['a', 'b'], { recordUndo: false })
      undoDone.then(() => {
        undoSettled = true
      })
    })

    // The undo's request is still queued behind the drag's in-flight write —
    // its own promise must not have resolved yet, however many microtasks
    // pass, until a real response for its own intent comes back.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(undoSettled).toBe(false)

    resolveDrag()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // The drag's write has now settled, but the undo write it queued behind
    // is still outstanding — still not resolved.
    expect(undoSettled).toBe(false)

    rejectUndo(new Error('network down'))
    let dragOk = false
    let undoOk = true
    await act(async () => {
      ;[dragOk, undoOk] = await Promise.all([dragDone, undoDone])
    })

    expect(setFavourites).toHaveBeenCalledTimes(2)
    expect(setFavourites).toHaveBeenNthCalledWith(1, 'p-life', ['b', 'a'])
    expect(setFavourites).toHaveBeenNthCalledWith(2, 'p-life', ['a', 'b'])
    expect(dragOk).toBe(true)
    expect(undoOk).toBe(false)
  })
})
