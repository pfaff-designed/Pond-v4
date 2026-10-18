/**
 * KAN-495 — a failed template apply (`writeStructural(..., { discardOnFailure: true })`)
 * must discard everything built on top of the blocks it was about to store,
 * not just its own halted op: a typed save the debounce queued (or was still
 * waiting out its pause for) while the template's save was failing was built
 * on those same discarded blocks, and letting it land silently re-stores a
 * half-applied template (no schema/props) while the screen shows the
 * reverted, pre-template page — screen != store.
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockWriter = jest.fn()
jest.mock('@/lib/pages/commit', () => ({
  createPageWriter: (..._args: unknown[]) => mockWriter,
}))

const original: Block = { id: 'b1', type: 'text', content: 'before template' }
const templateLine: Block = { id: 'tpl-1', type: 'text', content: '' }

const PAGE: PondPage = {
  id: 'page-template-fail',
  parentId: null,
  type: 'page',
  title: 'Untitled',
  blocks: [original],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function mountDraft(page: PondPage) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(
    () => {
      const getSupabase = useLazySupabase()
      return usePageDraft({ page, pageId: page.id, pondId: 'pond-1', getSupabase })
    },
    { wrapper: wrapper(client) }
  )
  return { result }
}

beforeEach(() => {
  mockWriter.mockReset()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('writeStructural discardOnFailure discards what was built on it (KAN-495)', () => {
  it('discards a typed op the debounce already queued behind the failed template apply', async () => {
    const page = { ...PAGE, id: 'page-template-fail-queued' }
    const { result } = mountDraft(page)

    let rejectTemplate: (err: unknown) => void = () => {}
    mockWriter.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (rejectTemplate = reject))
    )

    // '/' → pick a template: lands in place as its own structural op, still
    // in flight (the mocked write above never settles on its own).
    let applyResult!: Promise<boolean>
    act(() => {
      applyResult = result.current.writeStructural([templateLine], { discardOnFailure: true })
    })
    expect(result.current.viewBlocks).toEqual([templateLine])

    // While that save is still in flight, the person types into the applied
    // line and pauses — the ordinary debounced typed path.
    const typedAfterTemplate: Block = { ...templateLine, content: 'alpha' }
    act(() => {
      result.current.commitLocalEdit([typedAfterTemplate])
    })
    act(() => {
      jest.advanceTimersByTime(600)
    })
    // The debounce fired and enqueued its typed op — queued behind the still
    // in-flight structural one, not yet handed to the writer.
    expect(mockWriter).toHaveBeenCalledTimes(1)

    // Now the template apply's save rejects.
    await act(async () => {
      rejectTemplate(new Error('saveBlocks failed'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await applyResult).toBe(false)
    // The typed op built on the discarded template must never reach the
    // writer — no saveBlocks call ever carries the template's content.
    expect(mockWriter).toHaveBeenCalledTimes(1)
    expect(mockWriter.mock.calls[0][0]).toMatchObject({ after: { blocks: [templateLine] } })
    // The rendered blocks equal the stored blocks afterward (screen == store).
    expect(result.current.viewBlocks).toEqual([original])
  })

  it('cancels a debounced typed save still waiting out its pause when the template apply fails', async () => {
    const page = { ...PAGE, id: 'page-template-fail-pending' }
    const { result } = mountDraft(page)

    let rejectTemplate: (err: unknown) => void = () => {}
    mockWriter.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (rejectTemplate = reject))
    )

    let applyResult!: Promise<boolean>
    act(() => {
      applyResult = result.current.writeStructural([templateLine], { discardOnFailure: true })
    })

    // The person types but the 600ms pause hasn't elapsed yet — the typed
    // save is still sitting in `pendingSave`/`saveTimer`, never enqueued.
    const typedAfterTemplate: Block = { ...templateLine, content: 'alpha' }
    act(() => {
      result.current.commitLocalEdit([typedAfterTemplate])
    })
    expect(mockWriter).toHaveBeenCalledTimes(1)

    await act(async () => {
      rejectTemplate(new Error('saveBlocks failed'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await applyResult).toBe(false)
    expect(result.current.viewBlocks).toEqual([original])

    // If the pending debounce timer had NOT been cancelled, this would fire
    // it now and enqueue a typed write of the discarded template's content.
    act(() => {
      jest.advanceTimersByTime(600)
    })
    expect(mockWriter).toHaveBeenCalledTimes(1)
    expect(result.current.viewBlocks).toEqual([original])
  })

  it("a template apply that fails after the person moved to another page leaves that page alone", async () => {
    const pageA = { ...PAGE, id: 'page-template-fail-A' }
    const pageB: PondPage = {
      ...PAGE,
      id: 'page-template-fail-B',
      title: 'B',
      blocks: [{ id: 'b-1', type: 'text', content: 'page b' }],
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(
      ({ page }: { page: PondPage }) => {
        const getSupabase = useLazySupabase()
        return usePageDraft({ page, pageId: page.id, pondId: 'pond-1', getSupabase })
      },
      { wrapper: wrapper(client), initialProps: { page: pageA } }
    )

    let rejectTemplate: (err: unknown) => void = () => {}
    mockWriter.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (rejectTemplate = reject))
    )

    // Template apply on A, still in flight.
    let applyResult!: Promise<boolean>
    act(() => {
      applyResult = result.current.writeStructural([templateLine], { discardOnFailure: true })
    })

    // The person moves to B and types; the pause hasn't elapsed yet.
    rerender({ page: pageB })
    const typedOnB: Block = { id: 'b-1', type: 'text', content: 'page b, edited' }
    act(() => {
      result.current.commitLocalEdit([typedOnB])
    })

    // A's template save now fails.
    await act(async () => {
      rejectTemplate(new Error('saveBlocks failed'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await applyResult).toBe(false)

    // B still shows what the person typed on B, never A's blocks.
    expect(result.current.viewBlocks).toEqual([typedOnB])
    expect(result.current.saved).toBe(false)

    // B's own pending save still fires, carrying B's content.
    mockWriter.mockResolvedValue(undefined)
    await act(async () => {
      jest.advanceTimersByTime(600)
      await Promise.resolve()
    })
    expect(mockWriter).toHaveBeenCalledTimes(2)
    expect(mockWriter.mock.calls[1][0]).toMatchObject({ after: { blocks: [typedOnB] } })
  })
})
