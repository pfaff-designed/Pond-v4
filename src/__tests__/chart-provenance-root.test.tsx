/**
 * The chart card's `on` path starts at the pond's root page — its own title, read
 * off the home cache `DocumentPanel` fills (AUDIT W9), which is scoped to the pond
 * (#312). Reading an unscoped key found nothing and fell back to `life`.
 */

import React, { type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { homeQueryKey, pagesKey } from '@/lib/pages/keys'
import { PondContext } from '@/lib/pond/context'
import { useChartProvenance } from '@/lib/modules/view/use-chart-provenance'

const ROWS = [
  {
    id: 'kitchen',
    parent_id: null,
    type: 'page',
    title: 'kitchen',
    order: 0,
    updated_at: '2026-10-01T09:00:00Z',
  },
]

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(() => Promise.resolve(ROWS)),
}))

const POND = { id: 'pond-1', name: 'garden', glyph: null, theme: 'default', order: 0 }

const wrapperWith = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PondContext.Provider
        value={{ pond: POND, ponds: [POND], loading: false, reload: () => {}, addPond: () => {} }}
      >
        {children}
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return Wrapper
}

describe('useChartProvenance — the root word', () => {
  it('names the pond’s root page from the pond-scoped home cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(pagesKey('pond-1'), ROWS)
    client.setQueryData(homeQueryKey('pond-1'), { id: 'home-1', title: 'my garden', blocks: [] })

    const { result } = renderHook(() => useChartProvenance('kitchen', undefined), {
      wrapper: wrapperWith(client),
    })

    await waitFor(() => expect(result.current.on).toBe('my garden › kitchen'))
  })
})
