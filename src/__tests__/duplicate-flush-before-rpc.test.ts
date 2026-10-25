/**
 * KAN-468 follow-up: `duplicateAndOpen` must flush the duplicated page's link
 * parent's pending debounced save BEFORE calling `duplicatePage` — otherwise
 * a stale save (typing in "Kitchen" while duplicating one of its children
 * within the 600ms debounce) lands after the RPC and erases the page-link
 * block the RPC just appended to Kitchen's own `blocks`.
 */

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))
jest.mock('@/lib/pages/client', () => ({ duplicatePage: jest.fn() }))
jest.mock('@/lib/pages/page-flush', () => ({ flushPendingPageSave: jest.fn() }))
jest.mock('@/lib/pages/tree', () => ({ afterDuplicate: jest.fn() }))
jest.mock('@/lib/pages/nav', () => ({
  openWorkspaceUrl: jest.fn(),
  workspaceUrl: jest.fn(() => '/workspace'),
}))

import { QueryClient } from '@tanstack/react-query'
import { duplicateAndOpen } from '@/lib/pages/duplicate'
import { duplicatePage } from '@/lib/pages/client'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import { homeQueryKey } from '@/lib/pages/keys'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const router = { push: jest.fn(), replace: jest.fn() } as unknown as Parameters<
  typeof duplicateAndOpen
>[1]

beforeEach(() => jest.clearAllMocks())

describe('duplicateAndOpen — flushes the link parent before the RPC', () => {
  it('awaits the pending flush before duplicatePage is called', async () => {
    const order: string[] = []
    let resolveFlush!: () => void
    jest.mocked(flushPendingPageSave).mockImplementation(() => {
      order.push('flush')
      return new Promise<void>((resolve) => {
        resolveFlush = resolve
      })
    })
    jest.mocked(duplicatePage).mockImplementation(async () => {
      order.push('duplicatePage')
      return { id: 'rec-1', targetPageId: 'copy-1', title: 'Recipes 2' } as ChangeLogRecord & {
        title: string
      }
    })

    const queryClient = new QueryClient()
    const pending = duplicateAndOpen(
      queryClient,
      router,
      'pond-1',
      'recipes',
      'kitchen-1',
      { type: 'page', title: 'Recipes' },
      jest.fn()
    )

    expect(flushPendingPageSave).toHaveBeenCalledWith('kitchen-1')
    expect(duplicatePage).not.toHaveBeenCalled()

    resolveFlush()
    await pending

    expect(order).toEqual(['flush', 'duplicatePage'])
  })

  it('resolves a null parentId to the cached home row before flushing', async () => {
    jest.mocked(flushPendingPageSave).mockReturnValue(undefined)
    jest.mocked(duplicatePage).mockResolvedValue({
      id: 'rec-1',
      targetPageId: 'copy-1',
      title: 'Recipes 2',
    } as ChangeLogRecord & { title: string })
    const queryClient = new QueryClient()
    queryClient.setQueryData(homeQueryKey('pond-1'), { id: 'home-1', title: 'Life', blocks: [] })

    await duplicateAndOpen(
      queryClient,
      router,
      'pond-1',
      'recipes',
      null,
      { type: 'page', title: 'Recipes' },
      jest.fn()
    )

    expect(flushPendingPageSave).toHaveBeenCalledWith('home-1')
  })
})
