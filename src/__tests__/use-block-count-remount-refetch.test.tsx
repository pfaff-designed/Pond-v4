/**
 * KAN-122 fix — `useBlockCount`'s query inherited the app's global 30s
 * `staleTime` (`providers.tsx`) and nothing invalidates its sub-key when the
 * linked page's draft saves (`use-page-draft.ts` only `setQueryData`s
 * `['page', id]` itself) — so `/ nested page` → open the link → type → back
 * to the parent within 30s left the row reading the pre-edit count.
 * `staleTime: 0` + `refetchOnMount: 'always'` (same fix as `PageChangesPanel`'s
 * KAN-303) makes a remount always re-read, independent of staleness.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useBlockCount } from '@/lib/modules/page-link/use-block-count'
import { makeFakeSupabase } from './helpers/fake-supabase'

const fakeSupabase = makeFakeSupabase([
  {
    id: 'child-1',
    user_id: 'user-1',
    parent_id: 'parent-1',
    type: 'page',
    title: 'cabinets',
    blocks: [{ id: 'b-1', type: 'text', content: '' }],
    props: {},
    order: 0,
  },
])

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => fakeSupabase,
}))

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useBlockCount — remount after the linked page saves', () => {
  it('rereads the count on remount instead of serving the 30s-stale cache', async () => {
    // Shares the app's own default staleTime — a shorter one in the test
    // would hide the bug the ticket describes.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    })

    const { result, unmount } = renderHook(() => useBlockCount('child-1'), {
      wrapper: wrapper(queryClient),
    })
    await waitFor(() => expect(result.current).toBe(1))

    // The row unmounts with the parent's canvas while the person is away on
    // the linked page, and its draft saves straight to the row — never
    // through this hook, so the cache keeps the stale value here.
    unmount()
    const before = fakeSupabase._pages.get('child-1')!
    fakeSupabase._pages.set('child-1', {
      ...before,
      blocks: [
        { id: 'b-1', type: 'text', content: '' },
        { id: 'b-2', type: 'text', content: '' },
        { id: 'b-3', type: 'text', content: '' },
        { id: 'b-4', type: 'text', content: '' },
      ],
    })

    // Back to the parent, well inside the 30s window: the row remounts.
    const { result: second } = renderHook(() => useBlockCount('child-1'), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(second.current).toBe(4))
  })
})
