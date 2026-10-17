/**
 * KAN-139 — `closeBlockHistory` must wait for the own-edit record to land
 * before emptying a block's own undo stack. Closing it right after
 * `saveBlocks` (before `sessionUndo.remember` has the new record) left a
 * window where the field reports no undo depth but `sessionUndo` doesn't
 * have the step either, so a ⌘Z pressed in that window fell through to
 * whatever step was on top of the stack before this one.
 */

jest.mock('@/lib/pages/client', () => ({ saveBlocks: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn().mockResolvedValue([]),
  appendOwnEdit: jest.fn(),
}))

import { createRef, type RefObject } from 'react'
import { act, render } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { undoDepth } from '@tiptap/pm/history'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { appendOwnEdit } from '@/lib/change-log/store'
import { commitBlocks } from '@/lib/pages/commit'
import { sessionUndo } from '@/lib/change-log/session-undo'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import { findTextBlock, textEditorOf, writeInTextBlock } from './helpers/text-block'

const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>

const supabaseWithUser = (id: string) =>
  ({ auth: { getUser: async () => ({ data: { user: { id } } }) } }) as unknown as SupabaseClient<Database>

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

describe('commitBlocks — closeBlockHistory waits for the record to land', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionUndo.clear()
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  })

  it('leaves the block undoable until the record is logged, then empties it', async () => {
    const field = await renderBlock()
    writeInTextBlock(field, 'soak overnight, then simmer')
    expect(undoDepth(textEditorOf(field).state)).toBeGreaterThan(0)

    let resolveAppend: (record: ChangeLogRecord) => void = () => {}
    mockedAppend.mockImplementation(
      () => new Promise((resolve) => { resolveAppend = resolve })
    )

    const queryClient = { invalidateQueries: jest.fn() } as unknown as QueryClient
    const blocks = [
      { id: 'b1', type: 'text', content: 'soak overnight, then simmer' },
    ] as unknown as Block[]

    await act(async () => {
      await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', blocks, {
        pondId: 'pond-1',
        ownEdit: true,
        before: [],
      })
    })

    // The record hasn't landed yet — the field's own history is still intact.
    expect(undoDepth(textEditorOf(field).state)).toBeGreaterThan(0)
    expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(false)

    await act(async () => {
      resolveAppend({ id: 'rec-1' } as ChangeLogRecord)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(true)
    expect(undoDepth(textEditorOf(field).state)).toBe(0)
  })
})
