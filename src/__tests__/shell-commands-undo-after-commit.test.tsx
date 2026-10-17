/**
 * KAN-139 (comment 10064, the shell side) — once a text block's debounced
 * save commits and `closeBlockHistory` empties its own ProseMirror history, a
 * ⌘Z pressed with the caret still inside that block falls through to the
 * shell's change-log undo instead of doing nothing; before the commit, the
 * field keeps the chord as today.
 */

import { createRef, type RefObject } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: jest.fn().mockResolvedValue({ outcome: 'empty' }),
    redo: jest.fn().mockResolvedValue({ outcome: 'empty' }),
  },
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { closeBlockHistory } from '@/lib/modules/text/active-editor'
import TextEditor, { type Press } from '@/lib/modules/text/editor'
import { textSchema } from '@/lib/modules/text/schema'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

const renderShellWithBlock = () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShellCommands />
      <TextEditor
        data={textSchema.parse({ id: 'b1', type: 'text', content: 'soak overnight' })}
        onChange={jest.fn()}
        standIn={null}
        pressRef={createRef<Press | null>() as RefObject<Press | null>}
      />
    </QueryClientProvider>
  )
  return findTextBlock()
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})
afterEach(() => jest.restoreAllMocks())

describe('ShellCommands — ⌘Z after a commit empties the block’s own history', () => {
  it('reaches sessionUndo.undo once the focused block has nothing left to undo', async () => {
    const field = await renderShellWithBlock()
    writeInTextBlock(field, 'soak overnight, then simmer')
    field.focus()
    closeBlockHistory('b1')

    fireEvent.keyDown(field, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1')
  })

  it('leaves the chord with the field before the commit', async () => {
    const field = await renderShellWithBlock()
    writeInTextBlock(field, 'soak overnight, then simmer')
    field.focus()

    fireEvent.keyDown(field, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).not.toHaveBeenCalled()
    expect(field.textContent).toBe('soak overnight')
  })
})
