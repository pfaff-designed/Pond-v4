/**
 * KAN-95 — the selection bar writes the DOM selection into the editor only once,
 * immediately before one of its own commands. A bare `selectionchange` (ProseMirror's
 * own DOM rewrite while lifting a list item emits transient ones) dispatches nothing.
 */

import { useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { SelectionBar } from '@/components/molecules/SelectionBar'
import { registerTextEditor } from '@/lib/modules/text/active-editor'
import { proseExtensions } from '@/lib/modules/text/extensions'
import { serializeMarkdown } from '@/lib/modules/text/markdown'
import { clearSelection, selectWord } from './helpers/selection'

function Host({ onEditor }: { onEditor: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: proseExtensions,
    content: '<p>soak overnight</p>',
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
      <SelectionBar onAsk={jest.fn()} />
    </div>
  )
}

describe('SelectionBar editor selection sync', () => {
  afterEach(() => clearSelection())

  it('dispatches no editor transaction on a selectionchange alone', () => {
    let editor: Editor | null = null
    render(<Host onEditor={(e) => (editor = e)} />)
    const dispatch = jest.spyOn(editor!.view, 'dispatch')

    // Unfocused, so ProseMirror's own focus-gated selection mirroring stays out of the count.
    const text = screen.getByText('soak overnight').firstChild!
    const range = document.createRange()
    range.setStart(text, 5)
    range.setEnd(text, 14)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
      document.dispatchEvent(new Event('selectionchange'))
    })

    expect(screen.getByRole('toolbar', { name: 'selection' })).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('still bolds exactly the selected range from the bar', () => {
    let editor: Editor | null = null
    render(<Host onEditor={(e) => (editor = e)} />)

    selectWord(screen.getByText('soak overnight'), 'overnight')
    fireEvent.click(screen.getByRole('button', { name: 'bold' }))

    expect(serializeMarkdown(editor!.state.doc)).toBe('soak **overnight**')
  })
})
