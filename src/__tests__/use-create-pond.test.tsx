/**
 * Making a pond twice from one gesture: a second Enter or click lands before the
 * re-render that would show `pending`, so the guard cannot read render state
 * (AUDIT G9).
 */

import { act, renderHook } from '@testing-library/react'

const push = jest.fn()
const addPond = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/lib/pond/context', () => ({ usePond: () => ({ addPond }) }))
jest.mock('@/lib/pond/client', () => ({ createPond: jest.fn() }))

import { createPond } from '@/lib/pond/client'
import { useCreatePond } from '@/lib/pond/use-create-pond'

const create = createPond as jest.Mock
const NOISE = { id: 'p-noise', name: 'noise', glyph: null, theme: 'paper', order: 1 }

beforeEach(() => {
  push.mockClear()
  addPond.mockClear()
  create.mockReset()
})

describe('useCreatePond', () => {
  it('two calls in the same tick make one pond', async () => {
    let finish: (pond: typeof NOISE) => void = () => {}
    create.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useCreatePond())

    let results: boolean[] = []
    await act(async () => {
      const both = Promise.all([result.current.create('noise'), result.current.create('noise')])
      finish(NOISE)
      results = await both
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(results).toEqual([true, false])
    expect(addPond).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/workspace?pond=p-noise')
  })

  it('a failed make reports its message and can be tried again', async () => {
    create.mockRejectedValueOnce(new Error('name taken')).mockResolvedValueOnce(NOISE)
    const { result } = renderHook(() => useCreatePond())

    await act(async () => {
      expect(await result.current.create('noise')).toBe(false)
    })
    expect(result.current.failure).toBe('name taken')
    expect(result.current.pending).toBe(false)

    await act(async () => {
      expect(await result.current.create('noise')).toBe(true)
    })
    expect(result.current.failure).toBeNull()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('a thrown non-Error still reads as a message', async () => {
    create.mockRejectedValueOnce('boom')
    const { result } = renderHook(() => useCreatePond())
    await act(async () => {
      await result.current.create('x')
    })
    expect(result.current.failure).toBe('Could not create the pond')
  })
})
