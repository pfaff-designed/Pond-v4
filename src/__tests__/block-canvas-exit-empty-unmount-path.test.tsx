/**
 * #520 — an empty, unlabelled block goes when focus leaves it
 * (`removeEmptyOnExit`, ca6c267). Its own check is deferred a macrotask so a
 * menu or template preview opening (which moves focus outside the row) has
 * a render to prove itself a false alarm first (`exitGuardRef`). But closing
 * a record peek, or navigating off the page right after leaving an empty
 * block, unmounts the row before that macrotask ever runs — its cleanup
 * used to just `clearTimeout` the pending check and drop it, so the block,
 * and the write behind its removal, never happened at all. The cleanup now
 * flushes the same guarded check instead of discarding it.
 */

import React, { useState } from 'react'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { blockDomId } from '@/lib/modules/block-dom'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

function Harness({ initial, onChange }: { initial: Block[]; onChange: (next: Block[]) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
      onChange={(next) => {
        setBlocks(next)
        onChange(next)
      }}
      onUndoRemove={() => {}}
    />
  )
}

function renderHarness(initial: Block[], onChange: (next: Block[]) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

describe('an empty block removed on exit (#520)', () => {
  it('still goes when the canvas unmounts right after the blur, before the deferred check runs', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'kept' }
    const todo: Block = { id: 'b-todo', type: 'todo', items: [] }
    const onChange = jest.fn()
    const { unmount } = renderHarness([note, todo], onChange)

    const root = document.getElementById(blockDomId('b-todo'))!
    act(() => {
      root.focus()
    })
    expect(document.activeElement).toBe(root)

    // Blur, then leave the page right away — e.g. closing a record peek or
    // navigating off — before the deferred exit check's own macrotask runs.
    act(() => {
      root.blur()
    })
    unmount()

    // Give any pending timer a chance to run, proving none is left pending —
    // the removal above must already have happened synchronously in the
    // unmount's own cleanup.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(onChange).toHaveBeenCalledWith([note])
  })
})
