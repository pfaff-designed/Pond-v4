/**
 * KAN-445 path test (PATH_STEPS 3–6) — ⌘Z/⇧⌘Z with focus inside the entry
 * log's textareas reach `sessionUndo.undo`/`redo`, not the browser's own
 * field undo. `sessionUndo` is mocked here, so this proves ROUTING only —
 * that the removed row actually comes back as one step is proven live, not
 * in this test. Mirrors `shell-commands-undo-after-commit.test.tsx`'s
 * pattern: mount `ShellCommands` beside the real surface (here `EntriesView`,
 * stateful).
 */

import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
import { EntriesView } from '@/lib/modules/entries/view'
import type { EntriesBlock } from '@/lib/modules/entries/schema'

const threeEntries: EntriesBlock = {
  id: 'e1',
  type: 'entries',
  entries: [
    { id: 'u3', date: '3 nov', text: 'three' },
    { id: 'u2', date: '2 nov', text: '' },
    { id: 'u1', date: '1 nov', text: 'one' },
  ],
}

function StatefulEntries({ data }: { data: EntriesBlock }) {
  const [state, setState] = useState(data)
  return <EntriesView data={state} editable onChange={setState} />
}

const renderShellWithEntries = (data: EntriesBlock) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShellCommands />
      <StatefulEntries data={data} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})
afterEach(() => jest.restoreAllMocks())

describe('ShellCommands + EntriesView — ⌘Z/⇧⌘Z inside the entry log reach sessionUndo.undo/redo', () => {
  it('Backspace on the empty middle entry focuses the row above, caret at its end, and ⌘Z/⇧⌘Z reach the session', () => {
    renderShellWithEntries(threeEntries)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(texts).toHaveLength(3)

    fireEvent.keyDown(texts[1], { key: 'Backspace' })

    const next = screen.getAllByRole('textbox', { name: 'Entry text' })
    expect(next).toHaveLength(2)
    const above = next[0] as HTMLTextAreaElement
    expect(document.activeElement).toBe(above)
    expect(above.selectionStart).toBe(above.value.length)
    expect(above.selectionEnd).toBe(above.value.length)

    const prevented = fireEvent.keyDown(above, { key: 'z', metaKey: true })
    expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1')
    expect(prevented).toBe(false)

    fireEvent.keyDown(above, { key: 'z', metaKey: true, shiftKey: true })
    expect(sessionUndo.redo).toHaveBeenCalledWith('pond-1')
  })

  it('⌘Z in a non-empty entry’s textarea still reaches the session, not a swallowed field undo', () => {
    renderShellWithEntries(threeEntries)
    const texts = screen.getAllByRole('textbox', { name: 'Entry text' })
    const filled = texts[0] as HTMLTextAreaElement
    act(() => filled.focus())

    const prevented = fireEvent.keyDown(filled, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1')
    expect(prevented).toBe(false)
  })

  it('⌘Z with focus in the add-entry input stays the browser’s own field undo — the add line is outside the session-undo scope (KAN-445)', () => {
    renderShellWithEntries(threeEntries)
    const addInput = screen.getByRole('textbox', { name: 'Add entry' })
    act(() => addInput.focus())
    fireEvent.change(addInput, { target: { value: 'foo' } })

    fireEvent.keyDown(addInput, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).not.toHaveBeenCalled()
  })
})
