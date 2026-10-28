/**
 * ⌘K over a live text selection answers with the selection bar's link field
 * instead of the palette (KAN-465) — `ShellCommands` asks
 * (`requestSelectionLink`), `SelectionBar` owns the only mounted link field
 * and answers. With no selection, ⌘K still opens the palette as today.
 */

import { useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { clearSelection, selectWord } from './helpers/selection'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'budget' : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({ blocks: [] }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([
    {
      id: 'budget',
      title: 'budget',
      parent_id: null,
      type: 'page',
      order: 0,
      updated_at: '',
    },
  ]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))

const LIST = { name: 'command palette' }

function Host() {
  const editor = useEditor({
    extensions: proseExtensions,
    content: '<p>soak overnight</p>',
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    return registerTextEditor(editor)
  }, [editor])

  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeletionUndoProvider>
        <ShellCommands />
        {editor && <EditorContent editor={editor} />}
        <SelectionBar onAsk={jest.fn()} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const press = () => fireEvent.keyDown(document, { key: 'k', metaKey: true })

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

beforeEach(() => onPlatform('MacIntel'))
afterEach(() => {
  jest.restoreAllMocks()
  clearSelection()
})

describe('ShellCommands — ⌘K over a live text selection', () => {
  it('with no selection, still opens the palette', async () => {
    render(<Host />)

    act(() => press())

    expect(await screen.findByRole('combobox', LIST)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'link address' })).not.toBeInTheDocument()
  })

  it('with a live, non-empty text selection, opens the link field and never raises the palette', async () => {
    render(<Host />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    act(() => press())

    expect(await screen.findByRole('textbox', { name: 'link address' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', LIST)).toBeNull()
  })

  it('a second ⌘K while the link field is already open never raises the palette', async () => {
    render(<Host />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    act(() => press())
    const field = await screen.findByRole('textbox', { name: 'link address' })

    // Focusing the field has already cleared the browser's own selection —
    // the same effect a real press would have, confirmed before the second
    // ⌘K is what's actually under test.
    expect(field).toHaveFocus()
    act(() => press())

    expect(screen.queryByRole('combobox', LIST)).toBeNull()
    expect(screen.getByRole('textbox', { name: 'link address' })).toHaveFocus()
  })

  it('⌘K still opens the link field after Esc dismissed the bar but left the selection standing', async () => {
    render(<Host />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    act(() => fireEvent.keyDown(document, { key: 'Escape' }))
    expect(screen.queryByRole('toolbar', { name: 'selection' })).not.toBeInTheDocument()

    act(() => press())

    expect(await screen.findByRole('textbox', { name: 'link address' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', LIST)).toBeNull()
  })
})
