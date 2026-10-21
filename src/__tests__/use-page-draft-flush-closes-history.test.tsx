/**
 * KAN-368 — a flush must close its own flushed text blocks' Tiptap history
 * synchronously, at flush time, not wait for the save's own round trip
 * (`commit.ts`'s own close, which only runs once the record is durable).
 * Without this, focus landing in a neighbour block right after a structural
 * edit flushes a pending typing edit finds that block's history still open,
 * and the shell's ⌘Z undoes the flushed typing instead of falling through to
 * the structural edit's own session step.
 */

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const mockUpdateTitle = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

import { createRef, type RefObject } from 'react'
import React from 'react'
import { act, render, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { editorHistoryEmptyFor } from '@/lib/modules/text/active-editor'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import { usePageDraft } from '@/lib/pages/use-page-draft'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { flushPendingPageSave } from '@/lib/pages/page-flush'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'
import { findTextBlock, textEditorOf } from './helpers/text-block'

const PAGE: PondPage = {
  id: 'page-1',
  parentId: null,
  type: 'page',
  title: 'Untitled',
  blocks: [{ id: 'b1', type: 'text', content: 'soak overnight' } as Block],
  props: {},
  order: 0,
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function mountDraft() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result } = renderHook(
    () => {
      const getSupabase = useLazySupabase()
      return usePageDraft({ page: PAGE, pageId: PAGE.id, pondId: 'pond-1', getSupabase })
    },
    { wrapper: wrapper(client) }
  )
  return { result }
}

const renderBlock = async () => {
  render(
    <TextEditor
      data={textSchema.parse({ id: 'b1', type: 'text', content: 'soak overnight' })}
      onChange={jest.fn()}
      standIn={null}
      pressRef={createRef<Press | null>() as RefObject<Press | null>}
    />
  )
  return findTextBlock()
}

describe('usePageDraft flushNow closes the flushed blocks’ Tiptap history (KAN-368)', () => {
  beforeEach(() => {
    mockUpdateTitle.mockReset()
    mockCommitBlocks.mockReset()
    mockUpdateTitle.mockResolvedValue(undefined)
    mockCommitBlocks.mockReturnValue(new Promise(() => {})) // never resolves in this test
  })

  it('closes history synchronously at flush time, before the save lands', async () => {
    const field = await renderBlock()
    const { result } = mountDraft()

    act(() => {
      textEditorOf(field).commands.focus('end')
      textEditorOf(field).commands.insertContent(' extra')
    })
    expect(editorHistoryEmptyFor(field, 'undo')).toBe(false)

    act(() => {
      result.current.commitLocalEdit([{ id: 'b1', type: 'text', content: 'soak overnight extra' } as Block])
    })

    flushPendingPageSave(PAGE.id)

    // Asserted synchronously, right after flush — commitBlocks is still
    // unresolved at this point.
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(editorHistoryEmptyFor(field, 'undo')).toBe(true)
  })
})
