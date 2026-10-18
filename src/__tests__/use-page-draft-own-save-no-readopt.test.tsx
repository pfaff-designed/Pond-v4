/**
 * KAN-495 — a save of our OWN blocks must never be re-adopted as if it were
 * an external write. The seeding effect's same-page branch used to key off
 * `saved` (which flips the instant the queue's own `notify()` fires) instead
 * of `page` (the `['page', id]` query cache, which `enqueueTyped` only
 * reconciles a microtask later). That window let the effect run on the
 * render where `saved` had just flipped true but the cache was still
 * stale, compare the just-applied `queue.head()` against that stale cache,
 * and "adopt" it — reverting, for at least one real render, the blocks the
 * save had just written (which is what collapses a live selection in
 * `selection-bar-heading-path.test.tsx`).
 */

import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockWriter = jest.fn().mockResolvedValue(undefined)
const mockCreatePageWriter = jest.fn((..._args: unknown[]) => mockWriter)
jest.mock('@/lib/pages/commit', () => ({
  createPageWriter: (...args: unknown[]) => mockCreatePageWriter(...args),
}))

const heading: Block = { id: 'b1', type: 'text', content: 'heading' }
const renamed: Block = { id: 'b1', type: 'text', content: 'renamed' }

const PAGE: PondPage = {
  id: 'page-1',
  parentId: null,
  type: 'page',
  title: 'Untitled',
  blocks: [heading],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

// Every render's `viewBlocks`, in order — not just the latest snapshot — so a
// regression that reverts for one real render and self-heals on the next is
// still caught, the same way it would collapse a live selection in the DOM.
let seen: Block[][] = []

// Mirrors DocumentPanel's own wiring: `page` comes from the SAME QueryClient's
// `['page', id]` cache that `usePageDraft`'s own writes reconcile — not a
// value the test hands in directly — so the race between the queue's
// `notify()` and that cache's own update can actually happen.
function usePageDraftHarness() {
  const getSupabase = useLazySupabase()
  const { data: page } = useQuery({
    queryKey: ['page', PAGE.id],
    queryFn: () => Promise.resolve(PAGE),
  })
  const draft = usePageDraft({ page: page ?? null, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
  seen.push(draft.viewBlocks)
  return draft
}

function mountDraft() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(() => usePageDraftHarness(), { wrapper: wrapper(client) })
  return { result }
}

beforeEach(() => {
  seen = []
  mockWriter.mockClear()
  mockCreatePageWriter.mockClear()
})

it('a typed save of our own blocks is never reverted once it lands, even transiently', async () => {
  const { result } = mountDraft()
  await waitFor(() => expect(result.current.viewBlocks).toEqual([heading]))

  const editedAt = seen.length
  act(() => {
    result.current.commitLocalEdit([renamed])
  })
  expect(result.current.viewBlocks).toEqual([renamed])

  // Real debounce, real timers, real microtask/macrotask ordering — the
  // same kind of async gap the DOM test (no fake timers either) relies on
  // to expose this race.
  await waitFor(() => expect(mockWriter).toHaveBeenCalledTimes(1), { timeout: EDIT_PAUSE_MS + 1000 })
  await waitFor(() => expect(result.current.viewBlocks).toEqual([renamed]), { timeout: 1000 })
  // Give any further pending renders (the cache's own reconcile) a chance
  // to land too, so a later, separate revert isn't missed either.
  await new Promise((resolve) => setTimeout(resolve, 50))

  const reverted = seen
    .slice(editedAt)
    .filter((blocks) => JSON.stringify(blocks) === JSON.stringify([heading]))
  expect(reverted).toHaveLength(0)
  expect(result.current.viewBlocks).toEqual([renamed])
  expect(mockWriter).toHaveBeenCalledTimes(1)
})
