import { QueryClient } from '@tanstack/react-query'
import { saveThenStamp, stampChildLinksMigratedInCache } from './child-links'
import type { PondPage } from './client'

const pageWith = (props: Record<string, unknown>): PondPage => ({
  id: 'parent-1',
  parentId: null,
  type: 'page',
  title: 'Parent',
  blocks: [],
  order: 0,
  props,
})

describe('stampChildLinksMigratedInCache', () => {
  it('sets childLinksMigrated on the cached page', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['page', 'parent-1'], pageWith({ color: 'sage' }))

    stampChildLinksMigratedInCache(queryClient, 'parent-1')

    expect(queryClient.getQueryData(['page', 'parent-1'])).toMatchObject({
      props: { childLinksMigrated: true },
    })
  })

  it('keeps the page\'s other props untouched', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['page', 'parent-1'], pageWith({ color: 'sage', openedMarked: true }))

    stampChildLinksMigratedInCache(queryClient, 'parent-1')

    expect(queryClient.getQueryData(['page', 'parent-1'])).toMatchObject({
      props: { color: 'sage', openedMarked: true, childLinksMigrated: true },
    })
  })

  it('leaves a missing cache entry alone', () => {
    const queryClient = new QueryClient()

    stampChildLinksMigratedInCache(queryClient, 'missing-page')

    expect(queryClient.getQueryData(['page', 'missing-page'])).toBeUndefined()
  })
})

describe('saveThenStamp', () => {
  it('awaits flush before stamping', async () => {
    const order: string[] = []
    const flush = jest.fn(async () => {
      order.push('flush')
    })
    const stamp = jest.fn(async () => {
      order.push('stamp')
    })

    await saveThenStamp({ flush, stamp })

    expect(order).toEqual(['flush', 'stamp'])
  })

  it('never stamps when flush rejects, and rethrows', async () => {
    const flush = jest.fn(async () => {
      throw new Error('save failed')
    })
    const stamp = jest.fn(async () => undefined)

    await expect(saveThenStamp({ flush, stamp })).rejects.toThrow('save failed')
    expect(stamp).not.toHaveBeenCalled()
  })

  it('stamps when flush had nothing pending (undefined)', async () => {
    const flush = jest.fn(() => undefined)
    const stamp = jest.fn(async () => undefined)

    await saveThenStamp({ flush, stamp })

    expect(stamp).toHaveBeenCalledTimes(1)
  })
})
