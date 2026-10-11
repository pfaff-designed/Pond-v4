/**
 * KAN-95 — the selection bar's bold/italic items, wired to a real Tiptap
 * editor: resolve the editor under `window.getSelection()`, run
 * `toggleBold`/`toggleItalic`, and read `activeMarks` back into `aria-pressed`.
 */

import { useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { SelectionBar, type SelectionContext } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { serializeMarkdown } from '@/lib/modules/text/markdown'
import { clearSelection, selectWord } from './helpers/selection'

function Host({
  onAsk,
  onEditor,
  content = '<p>soak overnight</p>',
}: {
  onAsk: (ctx: SelectionContext) => void
  onEditor: (editor: Editor) => void
  content?: string
}) {
  const editor = useEditor({
    extensions: proseExtensions,
    content,
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    onEditor(editor)
    return registerTextEditor(editor)
  }, [editor, onEditor])

  if (!editor) return null
  return (
    <div>
      <EditorContent editor={editor} />
      <SelectionBar onAsk={onAsk} />
    </div>
  )
}

describe('SelectionBar bold/italic', () => {
  afterEach(() => clearSelection())

  it('bolds the selected word and reads the button as pressed', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'bold' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak **overnight**')
    expect(screen.getByRole('button', { name: 'bold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('italicizes the selected word and reads the button as pressed', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'italic' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak *overnight*')
    expect(screen.getByRole('button', { name: 'italic' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SelectionBar list', () => {
  afterEach(() => clearSelection())

  it('turns the selected line into a bullet list, then back into a plain paragraph', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'soak')
    fireEvent.click(screen.getByRole('button', { name: 'list' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('- soak overnight')
    expect(screen.getByRole('button', { name: 'list' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'list' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.getByRole('button', { name: 'list' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SelectionBar text style', () => {
  afterEach(() => clearSelection())

  it('opens the style menu, sets h2, then reverts to a paragraph', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'text' }))

    let menu = screen.getByRole('menu', { name: 'text style' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'h2' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('## soak overnight')
    expect(screen.getByRole('button', { name: 'h2' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'h2' }))
    menu = screen.getByRole('menu', { name: 'text style' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'text' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.getByRole('button', { name: 'text' })).toBeInTheDocument()
  })
})

describe('SelectionBar link', () => {
  afterEach(() => clearSelection())

  const typeUrl = (url: string) => {
    const field = screen.getByRole('textbox', { name: 'link address' })
    fireEvent.change(field, { target: { value: url } })
    return field
  }

  it('opens a one-field input, and ↵ links the selected word', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'link' }))
    fireEvent.keyDown(typeUrl('https://example.com'), { key: 'Enter' })

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak [overnight](https://example.com)')
    expect(screen.queryByRole('textbox', { name: 'link address' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'unlink' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('cancels back to the bar on Esc, leaving the text unlinked', () => {
    let editor: Editor | null = null
    render(<Host onAsk={jest.fn()} onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'link' }))
    fireEvent.keyDown(typeUrl('https://example.com'), { key: 'Escape' })

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.queryByRole('textbox', { name: 'link address' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'link' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers unlink when a link is already active, and removes it', () => {
    let editor: Editor | null = null
    render(
      <Host
        onAsk={jest.fn()}
        onEditor={(e) => (editor = e)}
        content='<p>soak <a href="https://example.com">overnight</a></p>'
      />
    )

    selectWord(screen.getByText('overnight'), 'overnight')
    const unlink = screen.getByRole('button', { name: 'unlink' })
    expect(unlink).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(unlink)

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak overnight')
    expect(screen.getByRole('button', { name: 'link' })).toHaveAttribute('aria-pressed', 'false')
  })
})
