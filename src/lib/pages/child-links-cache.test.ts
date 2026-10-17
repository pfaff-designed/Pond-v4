import { QueryClient } from '@tanstack/react-query'
import { stampChildLinksMigratedInCache } from './child-links'
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
