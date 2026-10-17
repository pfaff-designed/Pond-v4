import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { usePagePrefetchHandlers } from './use-page-prefetch'

type FakeClient = SupabaseClient<Database>

function renderWithClient(id: string, queryClient: QueryClient) {
  return renderHook(() => usePagePrefetchHandlers(id, jest.fn<FakeClient, []>()), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

describe('usePagePrefetchHandlers', () => {
  let queryClient: QueryClient
  let prefetchSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    queryClient = new QueryClient()
    prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('fires once after the pointer holds for 60ms', () => {
    const { result } = renderWithClient('page-1', queryClient)

    act(() => result.current.onPointerEnter())
    act(() => jest.advanceTimersByTime(60))

    expect(prefetchSpy).toHaveBeenCalledTimes(1)
    expect(prefetchSpy.mock.calls[0][0].queryKey).toEqual(['page', 'page-1'])
  })

  it('never fires if the pointer leaves before 60ms', () => {
    const { result } = renderWithClient('page-1', queryClient)

    act(() => result.current.onPointerEnter())
    act(() => jest.advanceTimersByTime(30))
    act(() => result.current.onPointerLeave())
    act(() => jest.advanceTimersByTime(60))

    expect(prefetchSpy).not.toHaveBeenCalled()
  })

  it('fires at once on focus', () => {
    const { result } = renderWithClient('page-1', queryClient)

    act(() => result.current.onFocus())

    expect(prefetchSpy).toHaveBeenCalledTimes(1)
  })

  it('a fast sweep across several rows (each held under 60ms) fires nothing', () => {
    const ids = ['page-1', 'page-2', 'page-3', 'page-4']

    for (const id of ids) {
      const { result } = renderWithClient(id, queryClient)
      act(() => result.current.onPointerEnter())
      act(() => jest.advanceTimersByTime(20))
      act(() => result.current.onPointerLeave())
    }

    act(() => jest.advanceTimersByTime(1000))

    expect(prefetchSpy).not.toHaveBeenCalled()
  })
})
