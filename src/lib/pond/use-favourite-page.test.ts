import { act, renderHook } from '@testing-library/react'

const patchPond = jest.fn()
const requestNotify = jest.fn()
let pond: { id: string; favouritePageIds?: string[] } | null = {
  id: 'p-life',
  favouritePageIds: ['a', 'b'],
}

jest.mock('./context', () => ({ usePond: () => ({ pond, patchPond }) }))
jest.mock('./client', () => ({ setPondFavourites: jest.fn() }))
jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: (...args: unknown[]) => requestNotify(...args) }))

import { setPondFavourites } from './client'
import { useFavouritePage } from './use-favourite-page'

const setFavourites = setPondFavourites as jest.Mock

beforeEach(() => {
  patchPond.mockClear()
  requestNotify.mockClear()
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
})
